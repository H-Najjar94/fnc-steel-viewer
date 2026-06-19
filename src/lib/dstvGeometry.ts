import * as THREE from "three";
import type { PartGeometry } from "../types";

const S = 0.001; // mm -> meters

/** Build a centered THREE.BufferGeometry from parsed DSTV part geometry. */
export function buildGeometry(geo: PartGeometry): THREE.BufferGeometry {
  let g: THREE.BufferGeometry;
  if (geo.kind === "plate" && geo.outline.length >= 3) {
    g = buildPlate(geo);
  } else if (geo.profile_type === "plate" && geo.outline.length >= 3) {
    g = buildPlate(geo);
  } else {
    g = buildProfile(geo);
  }
  g.computeVertexNormals();
  g.center();
  return g;
}

function buildPlate(geo: PartGeometry): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  geo.outline.forEach(([x, y], i) => {
    if (i === 0) shape.moveTo(x * S, y * S);
    else shape.lineTo(x * S, y * S);
  });
  // holes
  for (const h of geo.holes) {
    const path = new THREE.Path();
    path.absarc(h.x * S, h.y * S, (h.d / 2) * S, 0, Math.PI * 2, true);
    shape.holes.push(path);
  }
  const depth = Math.max(geo.thickness_mm, 1) * S;
  return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
}

function buildProfile(geo: PartGeometry): THREE.BufferGeometry {
  const H = (geo.height_mm || 100) * S;
  const B = (geo.width_mm || 100) * S;
  const tf = (geo.flange_t_mm || 8) * S;
  const tw = (geo.web_t_mm || 6) * S;
  const len = Math.max(geo.length_mm, 1) * S;

  const shape = sectionShape(geo.profile_type, H, B, tf, tw);
  if (!shape) {
    return new THREE.BoxGeometry(B, H, len);
  }
  const g = new THREE.ExtrudeGeometry(shape, { depth: len, bevelEnabled: false });
  // Stand profile members upright in the viewer so long members read as
  // columns/beams instead of lying flat on their side.
  g.rotateX(-Math.PI / 2);
  return g;
}

function sectionShape(
  type: string,
  H: number,
  B: number,
  tf: number,
  tw: number
): THREE.Shape | null {
  const s = new THREE.Shape();
  switch (type) {
    case "i-section": {
      const hy = H / 2;
      const wt = tw / 2;
      const fb = B / 2;
      const fi = hy - tf;
      const pts: [number, number][] = [
        [-fb, hy], [fb, hy], [fb, fi], [wt, fi],
        [wt, -fi], [fb, -fi], [fb, -hy], [-fb, -hy],
        [-fb, -fi], [-wt, -fi], [-wt, fi], [-fb, fi],
      ];
      poly(s, pts);
      return s;
    }
    case "channel": {
      const hy = H / 2;
      const fb = B / 2;
      const fi = hy - tf;
      const pts: [number, number][] = [
        [-fb, hy], [fb, hy], [fb, fi], [-fb + tw, fi],
        [-fb + tw, -fi], [fb, -fi], [fb, -hy], [-fb, -hy],
      ];
      poly(s, pts);
      return s;
    }
    case "tee": {
      const hy = H / 2;
      const fb = B / 2;
      const wt = tw / 2;
      const fi = hy - tf;
      const pts: [number, number][] = [
        [-fb, hy], [fb, hy], [fb, fi], [wt, fi],
        [wt, -hy], [-wt, -hy], [-wt, fi], [-fb, fi],
      ];
      poly(s, pts);
      return s;
    }
    case "angle": {
      const t = tf > 0 ? tf : tw;
      const pts: [number, number][] = [
        [0, 0], [B, 0], [B, t], [t, t], [t, H], [0, H],
      ];
      poly(s, pts);
      return s;
    }
    case "rhs": {
      const t = tf > 0 ? tf : tw || B * 0.08;
      const fb = B / 2;
      const hy = H / 2;
      poly(s, [[-fb, -hy], [fb, -hy], [fb, hy], [-fb, hy]]);
      const hole = new THREE.Path();
      poly(hole as unknown as THREE.Shape, [
        [-fb + t, -hy + t], [fb - t, -hy + t], [fb - t, hy - t], [-fb + t, hy - t],
      ]);
      s.holes.push(hole);
      return s;
    }
    case "chs": {
      const r = (H || B) / 2;
      const t = tf > 0 ? tf : Math.max(r * 0.12, 0.002);
      s.absarc(0, 0, r, 0, Math.PI * 2, false);
      const hole = new THREE.Path();
      hole.absarc(0, 0, Math.max(r - t, r * 0.4), 0, Math.PI * 2, true);
      s.holes.push(hole);
      return s;
    }
    default:
      return null;
  }
}

function poly(shape: THREE.Shape, pts: [number, number][]) {
  pts.forEach(([x, y], i) => (i === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y)));
  shape.closePath();
}
