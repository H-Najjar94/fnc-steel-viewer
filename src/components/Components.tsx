import { useEffect, useMemo, useState } from "react";
import { useStore } from "../store";
import { loadIfcModel, type IfcComponent, type Category } from "../lib/ifc";
import { listDxf, saveComponents, loadComponents } from "../lib/api";
import { findProject } from "../config";

const CAT_COLOR: Record<string, string> = {
  Column: "#3b82c4",
  Beam: "#e0922f",
  Plate: "#9aa7bd",
  Member: "#57b87a",
  Other: "#b0b6c2",
};
const CATS: (Category | "All")[] = ["All", "Plate", "Beam", "Column", "Member", "Other"];

interface SavedDoc {
  savedAt: string;
  count: number;
  components: IfcComponent[];
  dxf?: Record<string, string>; // mark(lc) -> dxf path, so links survive a reload
  index?: Record<string, number[]>; // mark(lc) -> IFC expressIDs, so part 3D skips the scan
}

export default function Components() {
  const project = useStore((s) => s.project);
  const partsByMark = useStore((s) => s.partsByMark);
  const assembliesByMark = useStore((s) => s.assembliesByMark);
  const select = useStore((s) => s.select);
  const setMainView = useStore((s) => s.setMainView);
  const setViewerTab = useStore((s) => s.setViewerTab);
  const applyComponents = useStore((s) => s.applyComponents);

  const [comps, setComps] = useState<IfcComponent[] | null>(null);
  const [pct, setPct] = useState(0);
  const [phase, setPhase] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cat, setCat] = useState<Category | "All">("All");
  const [q, setQ] = useState("");

  const [dxfMap, setDxfMap] = useState<Map<string, string>>(new Map());
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [fromSaved, setFromSaved] = useState(false);

  const ifcPath = project?.ifc_path ?? null;
  const root = project?.root ?? null;

  useEffect(() => {
    if (!root) return;
    let alive = true;
    setComps(null);
    setSavedAt(null);
    setFromSaved(false);
    const excludes = findProject(root)?.exclude ?? [];
    listDxf(root, excludes)
      .then((refs) => {
        if (!alive) return;
        const m = new Map<string, string>();
        for (const r of refs) if (r.mark) m.set(r.mark.toLowerCase(), r.path);
        setDxfMap(m);
      })
      .catch(() => {});
    loadComponents(root)
      .then((txt) => {
        if (!alive || !txt) return;
        try {
          const doc = JSON.parse(txt) as SavedDoc;
          if (Array.isArray(doc.components) && doc.components.length) {
            setComps(doc.components);
            setSavedAt(doc.savedAt);
            setFromSaved(true);
          }
        } catch {
          /* ignore malformed save */
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [root]);

  const load = async () => {
    if (!ifcPath) return;
    setLoading(true);
    setError(null);
    setPct(0);
    setPhase("Loading model");
    setFromSaved(false);
    try {
      const m = await loadIfcModel(ifcPath, (f) => setPct(Math.round(f * 100)));
      setPhase("Extracting components");
      setPct(0);
      const c = await m.getComponents((d, t) => setPct(t ? Math.round((d / t) * 100) : 0));
      setComps(c);
      setSavedAt(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
      setPhase("");
    }
  };

  const save = async () => {
    if (!root || !ifcPath || !comps) return;
    setSaving(true);
    setError(null);
    setPhase("Preparing 3D index");
    try {
      const stamp = new Date().toISOString();
      // Capture the mark→DXF links so they persist with the save and survive reload.
      const dxf: Record<string, string> = {};
      for (const c of comps) {
        const mk = c.mark?.toLowerCase();
        const path = mk ? dxfMap.get(mk) : undefined;
        if (mk && path) dxf[mk] = path;
      }
      // Build the part-mark → IFC geometry-ID index now and save it, so opening a
      // part's 3D after reload is instant (no re-scan). Cheap if components were
      // just extracted (already built in the same pass).
      setPct(0);
      const m = await loadIfcModel(ifcPath, (f) => setPct(Math.round(f * 100)));
      const idxMap = await m.getPartIndex((d, t) => setPct(t ? Math.round((d / t) * 100) : 0));
      const index: Record<string, number[]> = {};
      idxMap.forEach((v, k) => (index[k] = v));

      const doc: SavedDoc = { savedAt: stamp, count: comps.length, components: comps, dxf, index };
      await saveComponents(root, JSON.stringify(doc));
      // Fold into the live catalog now (sidebar counts, catalog list, assembly
      // parts panel links, part 3D index) without needing a reload.
      applyComponents(comps, dxf, idxMap);
      setSavedAt(stamp);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
      setPhase("");
    }
  };

  const byCat = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of comps ?? []) map.set(c.category, (map.get(c.category) ?? 0) + 1);
    return map;
  }, [comps]);

  const linked = useMemo(() => {
    if (!comps) return 0;
    let n = 0;
    for (const c of comps) if (c.mark && dxfMap.has(c.mark.toLowerCase())) n++;
    return n;
  }, [comps, dxfMap]);

  const filtered = useMemo(() => {
    if (!comps) return [];
    const s = q.trim().toLowerCase();
    return comps.filter(
      (c) =>
        (cat === "All" || c.category === cat) &&
        (!s ||
          c.mark.toLowerCase().includes(s) ||
          c.profile.toLowerCase().includes(s) ||
          c.name.toLowerCase().includes(s))
    );
  }, [comps, cat, q]);

  const resolve = (c: IfcComponent) => {
    const part = c.mark ? partsByMark.get(c.mark.toLowerCase()) : undefined;
    const asm = c.assemblyMark ? assembliesByMark.get(c.assemblyMark.toLowerCase()) : undefined;
    const target = part ?? asm ?? null;
    const pdfPath = part?.pdf_path ?? asm?.pdf_path ?? null;
    const pdfLabel = part?.pdf_path ? "PDF" : asm?.pdf_path ? "PDF (linked)" : null;
    return { part, asm, target, pdfPath, pdfLabel };
  };

  const openModel = (c: IfcComponent) => {
    const r = resolve(c);
    if (!r.target) return;
    setMainView("catalog");
    select({ kind: r.part ? "part" : "assembly", mark: r.target.mark });
    setViewerTab("3d");
  };

  const openPdf = (c: IfcComponent) => {
    const r = resolve(c);
    if (!r.target || !r.pdfPath) return;
    setMainView("catalog");
    select({ kind: r.part?.pdf_path ? "part" : "assembly", mark: r.target.mark });
    setViewerTab("pdf");
  };

  const openAssembly = (asmMark: string) => {
    setMainView("catalog");
    select({ kind: "assembly", mark: asmMark });
    setViewerTab("3d");
  };

  if (!ifcPath) {
    return <Center>This project has no 3D model (IFC) - nothing to extract components from.</Center>;
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-fnc-bg">
      <div className="flex flex-wrap items-center gap-2 border-b border-fnc-border bg-fnc-panel px-3 py-2">
        {!comps && !loading ? (
          <button
            onClick={load}
            className="rounded-md bg-fnc-red px-4 py-1.5 text-sm font-medium text-white transition hover:bg-fnc-red-dark"
          >
            Extract components from model
          </button>
        ) : loading ? (
          <div className="flex min-w-[280px] flex-1 items-center gap-3">
            <span className="whitespace-nowrap text-sm text-fnc-steel">
              {phase}... {pct}%
            </span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-fnc-bg">
              <div
                className="h-full rounded-full bg-fnc-red transition-[width] duration-150"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        ) : (
          <>
            {CATS.map((c) => (
              <button
                key={c}
                onClick={() => setCat(c)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                  cat === c ? "bg-fnc-red text-white" : "text-fnc-steel hover:bg-fnc-panel-2 hover:text-white"
                }`}
              >
                {c}
                {c !== "All" && byCat.get(c) ? ` (${byCat.get(c)})` : ""}
              </button>
            ))}
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search mark / profile..."
              className="ml-auto w-56 rounded-md border border-fnc-border bg-fnc-bg px-3 py-1.5 text-sm text-white placeholder:text-fnc-steel/70 focus:border-fnc-red focus:outline-none"
            />
            <button
              onClick={save}
              disabled={saving}
              className="rounded-md bg-fnc-red px-3 py-1.5 text-sm font-medium text-white transition hover:bg-fnc-red-dark disabled:opacity-50"
              title="Persist these components into the project and activate their links"
            >
              {saving ? `Saving… ${pct}%` : savedAt ? "Saved ✓ — Save again" : "Save to project"}
            </button>
            <button
              onClick={load}
              className="rounded-md border border-fnc-border px-3 py-1.5 text-sm text-fnc-steel transition hover:bg-fnc-panel-2 hover:text-white"
              title="Re-extract from the IFC model"
            >
              Re-extract
            </button>
          </>
        )}
      </div>

      {error && <p className="p-3 text-sm text-red-300">{error}</p>}

      {comps && !loading && (
        <div className="min-h-0 flex-1 overflow-auto p-2">
          <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-xs text-fnc-steel">
            <span>
              {filtered.length.toLocaleString()} of {comps.length.toLocaleString()} components
            </span>
            <span className="text-fnc-steel/60">|</span>
            <span>
              <span className="text-fnc-green">{linked.toLocaleString()}</span> linked to a DXF cut file
            </span>
            {fromSaved && savedAt && (
              <>
                <span className="text-fnc-steel/60">|</span>
                <span className="text-fnc-steel/70">loaded from saved {fmt(savedAt)}</span>
              </>
            )}
            {!fromSaved && savedAt && (
              <>
                <span className="text-fnc-steel/60">|</span>
                <span className="text-fnc-green">saved {fmt(savedAt)}</span>
              </>
            )}
          </div>
          <table className="w-full border-collapse text-xs">
            <thead className="sticky top-0 bg-fnc-bg">
              <tr className="text-left text-fnc-steel">
                <th className="px-2 py-1">Mark</th>
                <th className="px-2 py-1">Type</th>
                <th className="px-2 py-1">Profile</th>
                <th className="px-2 py-1 text-right">Qty</th>
                <th className="px-2 py-1">3D</th>
                <th className="px-2 py-1">PDF</th>
                <th className="px-2 py-1">Linked in</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c, i) => {
                const r = resolve(c);
                return (
                  <tr key={`${c.mark}-${i}`} className="border-b border-fnc-border/40 hover:bg-fnc-panel">
                    <td className="px-2 py-1">
                      <span className="flex items-center gap-2">
                        <span
                          className="inline-block h-2 w-2 rounded-full"
                          style={{ background: CAT_COLOR[c.category] }}
                        />
                        <span className="font-semibold text-white">{c.mark || "-"}</span>
                      </span>
                    </td>
                    <td className="px-2 py-1 text-fnc-steel">{c.name}</td>
                    <td className="px-2 py-1 text-fnc-steel">{c.profile}</td>
                    <td className="px-2 py-1 text-right text-fnc-steel">x{c.count}</td>
                    <td className="px-2 py-1">
                      {r.target ? (
                        <button
                          onClick={() => openModel(c)}
                          className="text-fnc-red hover:underline"
                          title="Open this component in the 3D viewer"
                        >
                          open
                        </button>
                      ) : (
                        <span className="text-fnc-steel/50">-</span>
                      )}
                    </td>
                    <td className="px-2 py-1">
                      {r.pdfPath ? (
                        <button
                          onClick={() => openPdf(c)}
                          className="text-fnc-red hover:underline"
                          title={r.pdfPath}
                        >
                          {r.pdfLabel}
                        </button>
                      ) : (
                        <span className="text-fnc-steel/50">-</span>
                      )}
                    </td>
                    <td className="px-2 py-1">
                      {c.assemblyMark ? (
                        <button
                          onClick={() => openAssembly(c.assemblyMark)}
                          className="text-fnc-red hover:underline"
                          title={`Open parent assembly ${c.assemblyMark}`}
                        >
                          {c.assemblyMark} -&gt;
                        </button>
                      ) : (
                        <span className="text-fnc-steel/50">-</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!comps && !loading && (
        <Center>
          Click "Extract components" to pull every plate, beam, column and member from the IFC model
          with their mark, profile, quantity, parent assembly, and linked files. Takes about 15-30 s
          the first time. Then "Save to project" to persist them and activate the links.
        </Center>
      )}
    </div>
  );
}

function fmt(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function Center({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-fnc-steel">
      {children}
    </div>
  );
}
