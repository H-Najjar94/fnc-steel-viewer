import * as THREE from "three";
import DxfParser from "dxf-parser";

const S = 0.001; // mm -> meters

export interface DxfPlateMeta {
  thicknessMm?: number;
  material?: string;
}

export interface DxfPlateResult {
  geometry: THREE.BufferGeometry;
  meta: DxfPlateMeta;
  holes: number;
}

interface Pt {
  x: number;
  y: number;
}
interface Loop {
  layer: string;
  pts: Pt[];
  area: number;
}

// Expand a polyline segment with a DXF bulge (tan of 1/4 included angle) into
// sampled arc points (excluding the start, including the end).
function bulgePoints(p0: Pt, p1: Pt, bulge: number): Pt[] {
  if (!bulge) return [{ x: p1.x, y: p1.y }];
  const chord = Math.hypot(p1.x - p0.x, p1.y - p0.y);
  if (chord < 1e-6) return [{ x: p1.x, y: p1.y }];
  const theta = 4 * Math.atan(bulge); // signed included angle
  const r = chord / (2 * Math.sin(Math.abs(theta) / 2));
  const mx = (p0.x + p1.x) / 2;
  const my = (p0.y + p1.y) / 2;
  const d = r * Math.cos(Math.abs(theta) / 2); // midpoint -> center distance
  const nx = -(p1.y - p0.y) / chord;
  const ny = (p1.x - p0.x) / chord;
  const sign = bulge > 0 ? 1 : -1;
  const cx = mx + nx * d * sign;
  const cy = my + ny * d * sign;
  let a0 = Math.atan2(p0.y - cy, p0.x - cx);
  let a1 = Math.atan2(p1.y - cy, p1.x - cx);
  if (bulge > 0 && a1 < a0) a1 += Math.PI * 2;
  if (bulge < 0 && a1 > a0) a1 -= Math.PI * 2;
  const steps = Math.max(2, Math.ceil(Math.abs(a1 - a0) / (Math.PI / 16)));
  const out: Pt[] = [];
  for (let i = 1; i <= steps; i++) {
    const a = a0 + (a1 - a0) * (i / steps);
    out.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return out;
}

function polylineLoop(e: any): Pt[] {
  const vs = e.vertices ?? [];
  if (vs.length < 2) return [];
  const closed = !!(e.shape || e.closed);
  const pts: Pt[] = [{ x: vs[0].x, y: vs[0].y }];
  for (let i = 0; i < vs.length - 1; i++) {
    pts.push(...bulgePoints(vs[i], vs[i + 1], vs[i].bulge || 0));
  }
  if (closed) pts.push(...bulgePoints(vs[vs.length - 1], vs[0], vs[vs.length - 1].bulge || 0));
  return pts;
}

function area(pts: Pt[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    a += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return Math.abs(a) / 2;
}

function centroid(pts: Pt[]): Pt {
  let x = 0;
  let y = 0;
  for (const p of pts) {
    x += p.x;
    y += p.y;
  }
  return { x: x / pts.length, y: y / pts.length };
}

function pointInPoly(pt: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x;
    const yi = poly[i].y;
    const xj = poly[j].x;
    const yj = poly[j].y;
    const hit = yi > pt.y !== yj > pt.y && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi;
    if (hit) inside = !inside;
  }
  return inside;
}

function parseMeta(entities: any[]): DxfPlateMeta {
  const meta: DxfPlateMeta = {};
  for (const e of entities) {
    if (e.type !== "TEXT" && e.type !== "MTEXT") continue;
    const t = String(e.text ?? "");
    if (meta.thicknessMm == null) {
      const m = /PL\s*([0-9]+(?:\.[0-9]+)?)/i.exec(t);
      if (m) meta.thicknessMm = parseFloat(m[1]);
    }
    if (!meta.material) {
      const m = /\bS[0-9]{3}[A-Z0-9]*/i.exec(t);
      if (m) meta.material = m[0].toUpperCase();
    }
  }
  return meta;
}

/**
 * Build an extruded plate solid from a Tekla-style per-part DXF cut file.
 * Outer contour = the largest closed loop (preferring the "CUT" layer); holes =
 * circles (and inner closed loops) that fall inside it. Returns null if no usable
 * closed contour is found.
 */
export function buildDxfPlateGeometry(text: string, thicknessMm?: number): DxfPlateResult | null {
  let dxf: any;
  try {
    dxf = new DxfParser().parseSync(text);
  } catch {
    return null;
  }
  const entities: any[] = dxf?.entities ?? [];
  const meta = parseMeta(entities);

  const loops: Loop[] = [];
  const circles: { c: Pt; r: number; layer: string }[] = [];
  for (const e of entities) {
    if (e.type === "LWPOLYLINE" || e.type === "POLYLINE") {
      const pts = polylineLoop(e);
      if (pts.length >= 3) loops.push({ layer: e.layer ?? "", pts, area: area(pts) });
    } else if (e.type === "CIRCLE" && e.radius > 0.01) {
      circles.push({ c: { x: e.center.x, y: e.center.y }, r: e.radius, layer: e.layer ?? "" });
    }
  }
  if (!loops.length) return null;

  // Outer = largest-area closed loop, preferring the CUT layer.
  const cut = loops.filter((l) => l.layer.toUpperCase() === "CUT");
  const pool = cut.length ? cut : loops;
  const outer = pool.reduce((a, b) => (b.area > a.area ? b : a));

  const shape = new THREE.Shape();
  outer.pts.forEach((p, i) => (i === 0 ? shape.moveTo(p.x * S, p.y * S) : shape.lineTo(p.x * S, p.y * S)));
  shape.closePath();

  let holeCount = 0;
  // Round holes that sit inside the outline.
  for (const h of circles) {
    if (!pointInPoly(h.c, outer.pts)) continue;
    const path = new THREE.Path();
    path.absarc(h.c.x * S, h.c.y * S, h.r * S, 0, Math.PI * 2, true);
    shape.holes.push(path);
    holeCount++;
  }
  // Inner closed loops (holes / slots / cutouts) strictly inside the outline.
  // Madar exports holes as polylines on a hole layer (e.g. "30"), not circles —
  // so include any inner loop except pure annotation layers.
  for (const l of loops) {
    if (l === outer || l.area >= outer.area * 0.98) continue;
    if (!pointInPoly(centroid(l.pts), outer.pts)) continue;
    const up = l.layer.toUpperCase();
    if (up === "SCRIBE" || up === "TEXT" || up === "LAYOUT") continue;
    const path = new THREE.Path();
    l.pts.forEach((p, i) => (i === 0 ? path.moveTo(p.x * S, p.y * S) : path.lineTo(p.x * S, p.y * S)));
    path.closePath();
    shape.holes.push(path);
    holeCount++;
  }

  const thick = (thicknessMm && thicknessMm > 0 ? thicknessMm : meta.thicknessMm) || 8;
  const depth = thick * S;
  const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  geometry.computeVertexNormals();
  geometry.center();
  return { geometry, meta: { ...meta, thicknessMm: thick }, holes: holeCount };
}
