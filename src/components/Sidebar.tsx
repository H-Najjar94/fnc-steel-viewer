import { useMemo } from "react";
import { useStore } from "../store";
import { num } from "../lib/format";

export default function Sidebar() {
  const { project, categoryFilter, setCategoryFilter, thicknessFilter, setThicknessFilter } =
    useStore();

  const thicknesses = useMemo(() => {
    if (!project) return [];
    const set = new Map<string, number>();
    for (const p of project.parts) {
      if (p.thickness_group) set.set(p.thickness_group, (set.get(p.thickness_group) || 0) + 1);
    }
    return [...set.entries()].sort((a, b) => {
      const na = parseInt(a[0].replace(/\D/g, "")) || 0;
      const nb = parseInt(b[0].replace(/\D/g, "")) || 0;
      return na - nb;
    });
  }, [project]);

  if (!project) return null;
  const s = project.stats;
  const plates = s.by_category["Plate"] || 0;
  const profiles = s.by_category["Profile"] || 0;

  const pick = (c: string | null) => {
    setCategoryFilter(c);
    if (c !== "Plate") setThicknessFilter(null);
  };

  return (
    <aside className="flex w-56 shrink-0 flex-col gap-1 overflow-y-auto border-r border-fnc-border bg-fnc-panel p-3">
      <Section>Browse</Section>
      <Item label="All items" count={s.assemblies + s.parts} active={categoryFilter === null} onClick={() => pick(null)} />
      <Item label="Assemblies" count={s.assemblies} active={categoryFilter === "Assembly"} onClick={() => pick("Assembly")} />
      <Item label="Profiles" count={profiles} active={categoryFilter === "Profile"} onClick={() => pick("Profile")} />
      <Item label="Plates" count={plates} active={categoryFilter === "Plate"} onClick={() => pick("Plate")} />

      {categoryFilter === "Plate" && thicknesses.length > 0 && (
        <div className="mt-1 ml-2 border-l border-fnc-border pl-2">
          <Item
            label="All thicknesses"
            count={plates}
            active={thicknessFilter === null}
            onClick={() => setThicknessFilter(null)}
            small
          />
          {thicknesses.map(([t, c]) => (
            <Item
              key={t}
              label={t}
              count={c}
              active={thicknessFilter === t}
              onClick={() => setThicknessFilter(t)}
              small
            />
          ))}
        </div>
      )}

      <Section>Project</Section>
      <Stat label="Drawings (PDF)" value={num(s.pdfs)} />
      <Stat label="DWG" value={num(s.dwgs)} />
      <Stat label="CNC .nc1" value={num(s.nc1)} />
      <Stat label="DXF" value={num(s.dxf)} />
      <Stat label="Part instances" value={num(s.part_instances)} />
    </aside>
  );
}

function Section({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-3 mb-1 px-1 text-[11px] font-semibold uppercase tracking-wide text-fnc-steel">
      {children}
    </div>
  );
}

function Item({
  label,
  count,
  active,
  onClick,
  small,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  small?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-between rounded-md px-2 ${
        small ? "py-1 text-[13px]" : "py-1.5 text-sm"
      } transition ${active ? "bg-fnc-red text-white" : "text-fnc-steel hover:bg-fnc-panel-2 hover:text-white"}`}
    >
      <span className="truncate">{label}</span>
      <span className={`ml-2 text-xs ${active ? "text-white/80" : "text-fnc-steel/70"}`}>{count}</span>
    </button>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-2 py-1 text-[13px]">
      <span className="text-fnc-steel">{label}</span>
      <span className="font-medium text-white">{value}</span>
    </div>
  );
}
