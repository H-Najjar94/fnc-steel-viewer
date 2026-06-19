import { useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useStore } from "../store";
import { kg } from "../lib/format";
import type { Selection } from "../types";

interface Row {
  kind: "assembly" | "part";
  mark: string;
  title: string; // name / part name
  sub: string; // profile / type
  meta: string; // material / parent
  weight: number;
  qty: number;
}

export default function Catalog() {
  const { project, categoryFilter, thicknessFilter, search, selection, select, instanceCounts, ifcAssemblyParts } =
    useStore();
  const parentRef = useRef<HTMLDivElement>(null);

  const rows = useMemo<Row[]>(() => {
    if (!project) return [];
    const q = search.trim().toLowerCase();
    const out: Row[] = [];

    const wantAssemblies = categoryFilter === null || categoryFilter === "Assembly";
    const wantParts = categoryFilter !== "Assembly";

    if (wantAssemblies) {
      for (const a of project.assemblies) {
        const count = instanceCounts.get(a.mark.toLowerCase()) ?? 1;
        const nParts = a.part_marks.length || (ifcAssemblyParts.get(a.mark.toLowerCase())?.length ?? 0);
        out.push({
          kind: "assembly",
          mark: a.mark,
          title: a.name || "Assembly",
          sub: `${nParts} parts`,
          meta: "Assembly",
          weight: 0,
          qty: count,
        });
      }
    }
    if (wantParts) {
      for (const p of project.parts) {
        if (categoryFilter === "Plate" && p.category !== "Plate") continue;
        if (categoryFilter === "Profile" && p.category !== "Profile") continue;
        if (thicknessFilter && p.thickness_group !== thicknessFilter) continue;
        out.push({
          kind: "part",
          mark: p.mark,
          title: p.name || p.category,
          sub: p.profile,
          meta: p.parent_assembly ? `↳ ${p.parent_assembly}` : p.material,
          weight: p.weight_kg,
          qty: p.quantity,
        });
      }
    }

    if (!q) return out;
    return out.filter(
      (r) =>
        r.mark.toLowerCase().includes(q) ||
        r.title.toLowerCase().includes(q) ||
        r.sub.toLowerCase().includes(q) ||
        r.meta.toLowerCase().includes(q)
    );
  }, [project, categoryFilter, thicknessFilter, search, instanceCounts, ifcAssemblyParts]);

  const virt = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 52,
    overscan: 12,
  });

  const isSel = (r: Row, sel: Selection | null) =>
    sel && sel.kind === r.kind && sel.mark.toLowerCase() === r.mark.toLowerCase();

  return (
    <div className="flex w-80 shrink-0 flex-col border-r border-fnc-border bg-fnc-bg">
      <div className="border-b border-fnc-border px-3 py-2 text-xs text-fnc-steel">
        {rows.length.toLocaleString()} items
      </div>
      <div ref={parentRef} className="flex-1 overflow-y-auto">
        <div style={{ height: virt.getTotalSize(), position: "relative", width: "100%" }}>
          {virt.getVirtualItems().map((vi) => {
            const r = rows[vi.index];
            const sel = isSel(r, selection);
            return (
              <button
                key={vi.key}
                onClick={() => select({ kind: r.kind, mark: r.mark })}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: vi.size,
                  transform: `translateY(${vi.start}px)`,
                }}
                className={`flex flex-col items-start justify-center border-b border-fnc-border/50 px-3 text-left transition ${
                  sel ? "bg-fnc-navy-light" : "hover:bg-fnc-panel"
                }`}
              >
                <div className="flex w-full items-center gap-2">
                  <span
                    className={`inline-block h-2 w-2 shrink-0 rounded-full ${
                      r.kind === "assembly" ? "bg-fnc-red" : "bg-fnc-steel"
                    }`}
                  />
                  <span className="font-semibold text-white">{r.mark}</span>
                  <span className="truncate text-xs text-fnc-steel">{r.title}</span>
                  {r.qty > 1 && (
                    <span className="ml-auto rounded bg-fnc-panel-2 px-1.5 py-0.5 text-[10px] text-fnc-steel">
                      ×{r.qty}
                    </span>
                  )}
                </div>
                <div className="flex w-full items-center gap-2 pl-4 text-[11px] text-fnc-steel">
                  <span className="truncate">{r.sub}</span>
                  <span className="ml-auto truncate">{r.weight > 0 ? kg(r.weight) : r.meta}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
