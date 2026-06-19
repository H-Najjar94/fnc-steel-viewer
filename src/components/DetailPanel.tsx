import { useEffect, useState } from "react";
import { useStore } from "../store";
import { mm, kg, num, basename } from "../lib/format";
import { openInDefaultApp } from "../lib/api";
import { loadIfcModel, type AssemblyPartMarked } from "../lib/ifc";
import type { Part, Assembly } from "../types";

export default function DetailPanel() {
  const { project, selection, partsByMark, assembliesByMark, select } = useStore();
  const [marked, setMarked] = useState<AssemblyPartMarked[]>([]);
  const [loadingParts, setLoadingParts] = useState(false);

  // Read the selected assembly's parts (with CNC marks) from the IFC, on demand.
  useEffect(() => {
    if (selection?.kind !== "assembly" || !project?.ifc_path) {
      setMarked([]);
      return;
    }
    let alive = true;
    setMarked([]);
    setLoadingParts(true);
    loadIfcModel(project.ifc_path)
      .then((m) => m.getAssemblyPartMarks(selection.mark))
      .then((p) => alive && setMarked(p))
      .catch(() => {})
      .finally(() => alive && setLoadingParts(false));
    return () => {
      alive = false;
    };
  }, [selection?.kind, selection?.mark, project?.ifc_path]);

  if (!project || !selection)
    return (
      <div className="w-72 shrink-0 border-l border-fnc-border bg-fnc-panel p-4 text-sm text-fnc-steel">
        Select an item.
      </div>
    );

  const key = selection.mark.toLowerCase();
  const part = selection.kind === "part" ? partsByMark.get(key) : undefined;
  const asm = selection.kind === "assembly" ? assembliesByMark.get(key) : undefined;

  return (
    <div className="flex w-72 shrink-0 flex-col overflow-y-auto border-l border-fnc-border bg-fnc-panel">
      <div className="border-b border-fnc-border p-4">
        <div className="text-[11px] uppercase tracking-wide text-fnc-steel">{selection.kind}</div>
        <div className="text-2xl font-bold text-white">{selection.mark}</div>
        <div className="text-sm text-fnc-steel">{part?.name || asm?.name}</div>
      </div>

      {part && <PartDetails part={part} onParent={(m) => select({ kind: "assembly", mark: m })} />}
      {asm && (
        <AssemblyDetails
          asm={asm}
          parts={marked}
          loading={loadingParts}
          partsByMark={partsByMark}
          onPart={(m) => select({ kind: "part", mark: m })}
        />
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-1.5 text-sm">
      <span className="text-fnc-steel">{label}</span>
      <span className="text-right font-medium text-white">{value}</span>
    </div>
  );
}

function PartDetails({ part, onParent }: { part: Part; onParent: (m: string) => void }) {
  return (
    <div className="p-4">
      <Row label="Profile" value={part.profile} />
      <Row label="Material" value={part.material} />
      <Row label="Category" value={part.category} />
      <Row label="Length" value={mm(part.length_mm)} />
      {part.category === "Plate" ? (
        <>
          <Row label="Width" value={mm(part.height_mm)} />
          <Row label="Thickness" value={mm(part.flange_t_mm)} />
        </>
      ) : (
        <>
          <Row label="Height" value={mm(part.height_mm)} />
          <Row label="Flange width" value={mm(part.width_mm)} />
          <Row label="Flange t" value={mm(part.flange_t_mm)} />
          <Row label="Web t" value={mm(part.web_t_mm)} />
        </>
      )}
      <Row label="Quantity" value={`×${num(part.quantity)}`} />
      <Row label="Unit weight" value={kg(part.weight_kg)} />
      <Row label="Total weight" value={kg(part.weight_kg * Math.max(part.quantity, 1))} />
      {part.parent_assembly && (
        <Row
          label="Assembly"
          value={
            <button onClick={() => onParent(part.parent_assembly)} className="text-fnc-red hover:underline">
              {part.parent_assembly} →
            </button>
          }
        />
      )}
      <FileLinks
        items={[
          ["Drawing PDF", part.pdf_path],
          ["DXF", part.dxf_path],
          ["NC1", part.nc1_path],
        ]}
      />
    </div>
  );
}

const CAT_COLOR: Record<string, string> = {
  Column: "#3b82c4",
  Beam: "#e0922f",
  Plate: "#9aa7bd",
  Member: "#57b87a",
  Other: "#b0b6c2",
};

function CoverageRow({ label, cnc, model }: { label: string; cnc: number; model: number }) {
  if (model === 0) return null;
  const full = cnc >= model;
  const none = cnc === 0;
  const icon = full ? "✓" : none ? "⚠" : "≈";
  const color = full ? "text-green-400" : none ? "text-amber-400" : "text-amber-300";
  const note = full ? "all have CNC files" : none ? "drawing only — no CNC files" : "some have CNC files";
  return (
    <div className="flex items-center gap-2 py-0.5 text-xs">
      <span className={`${color} w-3 text-center`}>{icon}</span>
      <span className="text-white">{label}</span>
      <span className="ml-auto text-fnc-steel">
        {cnc}/{model} · {note}
      </span>
    </div>
  );
}

function AssemblyDetails({
  asm,
  parts,
  loading,
  partsByMark,
  onPart,
}: {
  asm: Assembly;
  parts: AssemblyPartMarked[];
  loading: boolean;
  partsByMark: Map<string, Part>;
  onPart: (m: string) => void;
}) {
  // Group identical parts (same name + profile + mark) with a quantity.
  const groupedMap = new Map<string, AssemblyPartMarked & { qty: number }>();
  for (const p of parts) {
    const k = `${p.category}|${p.name}|${p.profile}|${p.mark}`;
    const e = groupedMap.get(k);
    if (e) e.qty += 1;
    else groupedMap.set(k, { ...p, qty: 1 });
  }
  const order = ["Beam", "Column", "Member", "Plate", "Other"];
  const grouped = [...groupedMap.values()].sort(
    (a, b) => order.indexOf(a.category) - order.indexOf(b.category) || a.name.localeCompare(b.name)
  );

  // Coverage: unique parts with a real CNC file (mark exists in the CNC catalog).
  const hasCnc = (mk: string) => !!mk && partsByMark.has(mk.toLowerCase());
  let modelPlate = 0,
    cncPlate = 0,
    modelProfile = 0,
    cncProfile = 0;
  for (const g of grouped) {
    if (g.category === "Plate") {
      modelPlate += 1;
      if (hasCnc(g.mark)) cncPlate += 1;
    } else {
      modelProfile += 1;
      if (hasCnc(g.mark)) cncProfile += 1;
    }
  }

  return (
    <div className="p-4">
      <Row label="Name" value={asm.name} />
      <Row label="Parts" value={num(parts.length || asm.part_marks.length)} />
      <FileLinks
        items={[
          ["Drawing PDF", asm.pdf_path],
          ["DWG", asm.dwg_path],
        ]}
      />

      {grouped.length > 0 && (
        <div className="mt-4 rounded-md border border-fnc-border bg-fnc-bg/40 p-2">
          <div className="mb-1 text-[11px] uppercase tracking-wide text-fnc-steel">CNC coverage</div>
          <CoverageRow label="Plates" cnc={cncPlate} model={modelPlate} />
          <CoverageRow label="Members" cnc={cncProfile} model={modelProfile} />
        </div>
      )}

      <div className="mt-4">
        <div className="mb-1 text-[11px] uppercase tracking-wide text-fnc-steel">
          Parts {grouped.length > 0 && `(${grouped.length} unique · ${parts.length} total)`}
        </div>
        {loading && <div className="text-xs text-fnc-steel">Reading parts from model…</div>}
        <div className="space-y-0.5">
          {grouped.map((g, i) => {
            const linked = hasCnc(g.mark);
            return (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span
                  className="inline-block h-2 w-2 shrink-0 rounded-full"
                  style={{ background: CAT_COLOR[g.category] ?? "#b0b6c2" }}
                />
                {linked ? (
                  <button
                    onClick={() => onPart(g.mark)}
                    className="truncate text-left text-fnc-red hover:underline"
                    title={`Open part ${g.mark}`}
                  >
                    {g.name || g.category} <span className="text-fnc-steel">{g.mark}</span>
                  </button>
                ) : (
                  <span className="truncate text-white">
                    {g.name || g.category}
                    {g.mark && <span className="text-fnc-steel"> · {g.mark}</span>}
                  </span>
                )}
                {g.qty > 1 && (
                  <span className="rounded bg-fnc-panel-2 px-1 text-[10px] text-fnc-steel">×{g.qty}</span>
                )}
                <span className="ml-auto truncate text-fnc-steel">{g.profile}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function FileLinks({ items }: { items: [string, string | null | undefined][] }) {
  const present = items.filter(([, p]) => !!p) as [string, string][];
  if (!present.length) return null;
  return (
    <div className="mt-4 border-t border-fnc-border pt-3">
      <div className="mb-1 text-[11px] uppercase tracking-wide text-fnc-steel">Files — click to open</div>
      {present.map(([label, path]) => (
        <button
          key={label}
          onClick={() => openInDefaultApp(path)}
          className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs transition hover:bg-fnc-panel-2"
          title={`Open ${path} in its default app`}
        >
          <span className="text-fnc-steel">{label}</span>
          <span className="truncate text-fnc-red">⤓ {basename(path)}</span>
        </button>
      ))}
    </div>
  );
}
