import { useEffect, useMemo, useState } from "react";
import DxfParser from "dxf-parser";
import type { Assembly, Part } from "../../types";
import { openInDefaultApp, readTextFile } from "../../lib/api";
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
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

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

export default function CadViewer({
  part,
  asm,
}: {
  part: Part | undefined;
  asm: Assembly | undefined;
}) {
  const [dxfText, setDxfText] = useState<string | null>(null);

  const cadPath = part?.dxf_path ?? asm?.dwg_path ?? null;
  const cadKind = part?.dxf_path ? "DXF" : asm?.dwg_path ? "DWG" : null;

  useEffect(() => {
    setDxfText(null);
    if (!part?.dxf_path) return;
    readTextFile(part.dxf_path).then(setDxfText).catch(() => setDxfText(""));
  }, [part?.dxf_path]);

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

  if (!cadPath) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-fnc-steel">
        No CAD file for this item.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-fnc-border bg-fnc-panel px-3 py-1.5 text-xs text-fnc-steel">
        <span className="text-white">CAD</span>
        <span>{cadKind}</span>
        <span className="truncate" title={cadPath}>
          · {basename(cadPath)}
        </span>
        {asm?.dwg_path && (
          <button
            onClick={() => openInDefaultApp(cadPath)}
            className="ml-auto rounded-md border border-fnc-border px-2 py-0.5 text-[11px] text-white transition hover:bg-fnc-panel-2"
          >
            Open DWG
          </button>
        )}
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-hidden bg-fnc-bg p-4">
          {part?.dxf_path && !parsed && dxfText !== null && (
            <p className="text-sm text-fnc-steel">Could not parse DXF.</p>
          )}
          {part?.dxf_path && parsed && (
            <svg viewBox={vb} className="h-full w-full" preserveAspectRatio="xMidYMid meet">
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
          {asm?.dwg_path && (
            <div className="flex h-full items-center justify-center text-center text-sm text-fnc-steel">
              <div>
                <div className="mb-2 text-white">DWG file selected</div>
                <div className="max-w-md leading-relaxed">
                  This build uses the actual CAD file only. DWG preview is not rendered
                  in-app yet, so use the button above to open the source DWG.
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
