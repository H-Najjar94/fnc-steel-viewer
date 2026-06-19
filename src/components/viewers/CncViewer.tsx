import { useEffect, useMemo, useState } from "react";
import DxfParser from "dxf-parser";
import type { Part } from "../../types";
import { readTextFile } from "../../lib/api";
import { basename } from "../../lib/format";

interface Seg {
  d: string;
}
interface Circle {
  cx: number;
  cy: number;
  r: number;
}
interface Parsed {
  segs: Seg[];
  circles: Circle[];
  min: [number, number];
  max: [number, number];
}

function parseDxf(text: string): Parsed | null {
  const parser = new DxfParser();
  let dxf: any;
  try {
    dxf = parser.parseSync(text);
  } catch {
    return null;
  }
  const segs: Seg[] = [];
  const circles: Circle[] = [];
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  const acc = (x: number, y: number) => {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };

  for (const e of dxf?.entities ?? []) {
    switch (e.type) {
      case "LINE": {
        const v = e.vertices;
        if (v?.length >= 2) {
          segs.push({ d: `M ${v[0].x} ${v[0].y} L ${v[1].x} ${v[1].y}` });
          acc(v[0].x, v[0].y);
          acc(v[1].x, v[1].y);
        }
        break;
      }
      case "LWPOLYLINE":
      case "POLYLINE": {
        const v = e.vertices ?? [];
        if (v.length) {
          let d = `M ${v[0].x} ${v[0].y}`;
          v.forEach((p: any) => {
            d += ` L ${p.x} ${p.y}`;
            acc(p.x, p.y);
          });
          if (e.shape || e.closed) d += " Z";
          segs.push({ d });
        }
        break;
      }
      case "CIRCLE": {
        circles.push({ cx: e.center.x, cy: e.center.y, r: e.radius });
        acc(e.center.x - e.radius, e.center.y - e.radius);
        acc(e.center.x + e.radius, e.center.y + e.radius);
        break;
      }
      case "ARC": {
        const { center: c, radius: r } = e;
        const a0 = (e.startAngle * Math.PI) / 180;
        const a1 = (e.endAngle * Math.PI) / 180;
        const x0 = c.x + r * Math.cos(a0);
        const y0 = c.y + r * Math.sin(a0);
        const x1 = c.x + r * Math.cos(a1);
        const y1 = c.y + r * Math.sin(a1);
        let sweep = a1 - a0;
        if (sweep < 0) sweep += Math.PI * 2;
        const large = sweep > Math.PI ? 1 : 0;
        segs.push({ d: `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}` });
        acc(c.x - r, c.y - r);
        acc(c.x + r, c.y + r);
        break;
      }
      case "SPLINE": {
        const pts = e.controlPoints ?? e.fitPoints ?? [];
        if (pts.length) {
          let d = `M ${pts[0].x} ${pts[0].y}`;
          pts.forEach((p: any) => {
            d += ` L ${p.x} ${p.y}`;
            acc(p.x, p.y);
          });
          segs.push({ d });
        }
        break;
      }
    }
  }
  if (!isFinite(minX)) return null;
  return { segs, circles, min: [minX, minY], max: [maxX, maxY] };
}

export default function CncViewer({ part }: { part: Part }) {
  const [dxfText, setDxfText] = useState<string | null>(null);
  const [nc1Text, setNc1Text] = useState<string | null>(null);

  useEffect(() => {
    setDxfText(null);
    setNc1Text(null);
    if (part.dxf_path) readTextFile(part.dxf_path).then(setDxfText).catch(() => setDxfText(""));
    if (part.nc1_path) readTextFile(part.nc1_path).then(setNc1Text).catch(() => setNc1Text(""));
  }, [part.dxf_path, part.nc1_path]);

  const parsed = useMemo(() => (dxfText ? parseDxf(dxfText) : null), [dxfText]);

  const vb = parsed
    ? (() => {
        const [minX, minY] = parsed.min;
        const [maxX, maxY] = parsed.max;
        const w = maxX - minX || 1;
        const h = maxY - minY || 1;
        const pad = Math.max(w, h) * 0.05;
        return `${minX - pad} ${-(maxY + pad)} ${w + pad * 2} ${h + pad * 2}`;
      })()
    : "0 0 1 1";
  const stroke = parsed ? Math.max(parsed.max[0] - parsed.min[0], parsed.max[1] - parsed.min[1]) / 300 : 1;

  return (
    <div className="flex h-full">
      <div className="flex min-w-0 flex-1 flex-col border-r border-fnc-border">
        <div className="border-b border-fnc-border bg-fnc-panel px-3 py-1.5 text-xs text-fnc-steel">
          DXF cut profile{part.dxf_path ? ` · ${basename(part.dxf_path)}` : ""}
        </div>
        <div className="flex-1 overflow-hidden bg-fnc-bg p-4">
          {!part.dxf_path && <p className="text-sm text-fnc-steel">No DXF for this part.</p>}
          {part.dxf_path && !parsed && dxfText !== null && (
            <p className="text-sm text-fnc-steel">Could not parse DXF.</p>
          )}
          {parsed && (
            <svg viewBox={vb} className="h-full w-full" preserveAspectRatio="xMidYMid meet">
              {/* CAD y-up -> SVG y-down handled by negating y in viewBox + group */}
              <g transform="scale(1,-1)">
                {parsed.segs.map((s, i) => (
                  <path key={i} d={s.d} fill="none" stroke="#c0202a" strokeWidth={stroke} />
                ))}
                {parsed.circles.map((c, i) => (
                  <circle
                    key={`c${i}`}
                    cx={c.cx}
                    cy={c.cy}
                    r={c.r}
                    fill="none"
                    stroke="#9aa7bd"
                    strokeWidth={stroke}
                  />
                ))}
              </g>
            </svg>
          )}
        </div>
      </div>

      <div className="flex w-96 shrink-0 flex-col">
        <div className="border-b border-fnc-border bg-fnc-panel px-3 py-1.5 text-xs text-fnc-steel">
          DSTV NC1{part.nc1_path ? ` · ${basename(part.nc1_path)}` : ""}
        </div>
        <pre className="flex-1 overflow-auto bg-fnc-bg p-3 text-[11px] leading-relaxed text-fnc-steel">
          {nc1Text ?? "Loading…"}
        </pre>
      </div>
    </div>
  );
}
