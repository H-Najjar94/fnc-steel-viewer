import { create } from "zustand";
import type { ProjectIndex, Part, Assembly, Selection } from "./types";
import type { AssemblyPart as IfcAssemblyPart, IfcComponent } from "./lib/ifc";
import { scanProject, loadComponents } from "./lib/api";
import { findProject } from "./config";

export type { IfcAssemblyPart };

export type DxfMap = Record<string, string>; // mark(lc) -> dxf path

// Turn an IFC-extracted component into a catalog Part so it shows up in the
// sidebar counts, the catalog list, and links from the assembly parts panel.
function componentToPart(c: IfcComponent, dxf?: string): Part {
  const isPlate = c.category === "Plate";
  const m = /PL\s*(\d+)/i.exec(c.profile || "");
  return {
    mark: c.mark,
    name: c.name || c.category,
    category: isPlate ? "Plate" : "Profile",
    profile: c.profile,
    profile_type: "",
    material: "",
    length_mm: 0,
    width_mm: 0,
    height_mm: 0,
    flange_t_mm: 0,
    web_t_mm: 0,
    radius_mm: 0,
    weight_per_m: 0,
    weight_kg: 0,
    quantity: c.count,
    thickness_group: isPlate && m ? `PL${m[1]}` : null,
    parent_assembly: c.assemblyMark,
    nc1_path: null,
    dxf_path: dxf ?? null,
    pdf_path: null,
  };
}

// Merge components into a project (additively, deduped by mark). Returns a new
// project with refreshed parts + stats, or null if nothing new was added.
function withComponents(
  project: ProjectIndex,
  components: IfcComponent[],
  dxf?: DxfMap
): ProjectIndex | null {
  const byMark = new Map(project.parts.map((p) => [p.mark.toLowerCase(), p] as const));
  const added: Part[] = [];
  let enriched = false;
  for (const c of components) {
    const mk = (c.mark || "").toLowerCase();
    if (!mk) continue;
    const existingPart = byMark.get(mk);
    if (existingPart) {
      // Part already in the catalog (e.g. from a DXF) — fill the parent assembly
      // relation from the IFC if it's missing.
      if (!existingPart.parent_assembly && c.assemblyMark) {
        existingPart.parent_assembly = c.assemblyMark;
        enriched = true;
      }
      continue;
    }
    const p = componentToPart(c, dxf?.[mk]);
    byMark.set(mk, p);
    added.push(p);
  }
  if (!added.length && !enriched) return null;

  const parts = [...project.parts, ...added];
  const by_category = { ...project.stats.by_category };
  let part_instances = project.stats.part_instances;
  for (const p of added) {
    by_category[p.category] = (by_category[p.category] || 0) + 1;
    part_instances += Math.max(p.quantity, 1);
  }
  const stats = { ...project.stats, parts: parts.length, part_instances, by_category };
  return { ...project, parts, stats };
}

export type ViewerTab = "3d" | "cad" | "pdf" | "cnc" | "data";
export type MainView = "catalog" | "reports" | "components";

const RECENTS_KEY = "fnc.recentProjects";

function loadRecents(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENTS_KEY) || "[]");
  } catch {
    return [];
  }
}
function saveRecents(list: string[]) {
  localStorage.setItem(RECENTS_KEY, JSON.stringify(list.slice(0, 8)));
}

interface AppState {
  project: ProjectIndex | null;
  loading: boolean;
  error: string | null;
  recents: string[];

  // lookup maps (built on load)
  partsByMark: Map<string, Part>;
  assembliesByMark: Map<string, Assembly>;
  instanceCounts: Map<string, number>; // mark -> identical-assembly count (from IFC)
  ifcAssemblyParts: Map<string, IfcAssemblyPart[]>; // mark(lc) -> parts from IFC
  ifcPartIndex: Map<string, number[]>; // part mark(lc) -> IFC expressIDs (from saved components)
  setIfcData: (counts: Map<string, number>, parts: Map<string, IfcAssemblyPart[]>) => void;

  // UI
  mainView: MainView;
  selection: Selection | null;
  trail: Selection[]; // navigation breadcrumb
  pos: number; // index into trail of the current selection
  viewerTab: ViewerTab;
  viewerMaximized: boolean;
  search: string;
  categoryFilter: string | null; // "Plate" | "Profile" | null
  thicknessFilter: string | null; // "PL10" | null

  openProject: (root: string, useCache?: boolean) => Promise<void>;
  applyComponents: (components: IfcComponent[], dxf?: DxfMap, index?: Map<string, number[]>) => void;
  reload: () => Promise<void>;
  closeProject: () => void;
  select: (sel: Selection | null) => void;
  selectByMark: (mark: string) => void;
  back: () => void;
  forward: () => void;
  jumpTo: (i: number) => void;
  closeTab: (i: number) => void;
  closeOthers: (i: number) => void;
  closeAll: () => void;
  setViewerTab: (t: ViewerTab) => void;
  toggleViewerMaximized: () => void;
  setMainView: (v: MainView) => void;
  setSearch: (s: string) => void;
  setCategoryFilter: (c: string | null) => void;
  setThicknessFilter: (t: string | null) => void;
}

export const useStore = create<AppState>((set, get) => ({
  project: null,
  loading: false,
  error: null,
  recents: loadRecents(),
  partsByMark: new Map(),
  assembliesByMark: new Map(),
  instanceCounts: new Map(),
  ifcAssemblyParts: new Map(),
  ifcPartIndex: new Map(),
  setIfcData: (instanceCounts, ifcAssemblyParts) => set({ instanceCounts, ifcAssemblyParts }),

  mainView: "catalog",
  selection: null,
  trail: [],
  pos: -1,
  viewerTab: "3d",
  viewerMaximized: false,
  search: "",
  categoryFilter: null,
  thicknessFilter: null,

  openProject: async (root, useCache = true) => {
    set({ loading: true, error: null });
    try {
      let project = await scanProject(root, useCache, findProject(root)?.exclude ?? []);
      // Fold in previously-saved IFC components (if any) so the sidebar counts,
      // catalog, and assembly parts panel reflect them right away on launch.
      let ifcPartIndex = new Map<string, number[]>();
      try {
        const txt = await loadComponents(root);
        if (txt) {
          const doc = JSON.parse(txt) as {
            components?: IfcComponent[];
            dxf?: DxfMap;
            index?: Record<string, number[]>;
          };
          const merged = withComponents(project, doc.components ?? [], doc.dxf);
          if (merged) project = merged;
          // Saved part-mark -> expressID index: lets part 3D skip the scan.
          if (doc.index) ifcPartIndex = new Map(Object.entries(doc.index));
        }
      } catch {
        /* no saved components / malformed — ignore */
      }
      const partsByMark = new Map<string, Part>();
      project.parts.forEach((p) => partsByMark.set(p.mark.toLowerCase(), p));
      const assembliesByMark = new Map<string, Assembly>();
      project.assemblies.forEach((a) => assembliesByMark.set(a.mark.toLowerCase(), a));

      const recents = [root, ...get().recents.filter((r) => r !== root)];
      saveRecents(recents);

      // Default selection: show a 3D model on start.
      //  - If the project has an IFC, open on an assembly so the 3D tab shows the
      //    full building model.
      //  - Otherwise open on a profile part (beam/column) so the 3D tab shows a
      //    reconstructed steel part immediately.
      let selection: Selection | null = null;
      if (project.ifc_path && project.assemblies.length) {
        selection = { kind: "assembly", mark: project.assemblies[0].mark };
      } else {
        const opener =
          project.parts.find((p) => p.category === "Profile" && p.nc1_path) ??
          project.parts.find((p) => p.nc1_path) ??
          project.parts[0];
        if (opener) selection = { kind: "part", mark: opener.mark };
        else if (project.assemblies.length)
          selection = { kind: "assembly", mark: project.assemblies[0].mark };
      }

      set({
        project,
        partsByMark,
        assembliesByMark,
        instanceCounts: new Map(),
        ifcAssemblyParts: new Map(),
        ifcPartIndex,
        loading: false,
        selection,
        trail: selection ? [selection] : [],
        pos: selection ? 0 : -1,
        mainView: "catalog",
        search: "",
        categoryFilter: null,
        thicknessFilter: null,
        recents,
      });
    } catch (e) {
      set({ loading: false, error: String(e) });
    }
  },

  applyComponents: (components, dxf, index) =>
    set((s) => {
      if (!s.project) return s;
      const merged = withComponents(s.project, components, dxf);
      const ifcPartIndex = index ? new Map(index) : s.ifcPartIndex;
      if (!merged) return { ifcPartIndex };
      const partsByMark = new Map(s.partsByMark);
      merged.parts.forEach((p) => partsByMark.set(p.mark.toLowerCase(), p));
      return { project: merged, partsByMark, ifcPartIndex };
    }),

  reload: async () => {
    const root = get().project?.root;
    if (root) await get().openProject(root, false);
  },

  closeProject: () => set({ project: null, selection: null, trail: [], pos: -1, error: null }),

  // Open a selection as a tab. If it's already open, just activate it; otherwise
  // append a new tab. `trail` is the list of open tabs, `pos` the active index.
  select: (sel) =>
    set((s) => {
      if (!sel) return { selection: null };
      const idx = s.trail.findIndex(
        (t) => t.kind === sel.kind && t.mark.toLowerCase() === sel.mark.toLowerCase()
      );
      if (idx >= 0) return { pos: idx, selection: s.trail[idx] };
      const trail = [...s.trail, sel].slice(-30);
      return { trail, pos: trail.length - 1, selection: sel };
    }),

  selectByMark: (mark) => {
    const m = mark.toLowerCase();
    const { assembliesByMark, partsByMark } = get();
    if (assembliesByMark.has(m)) get().select({ kind: "assembly", mark });
    else if (partsByMark.has(m)) get().select({ kind: "part", mark });
  },

  back: () => set((s) => (s.pos > 0 ? { pos: s.pos - 1, selection: s.trail[s.pos - 1] } : s)),
  forward: () =>
    set((s) => (s.pos < s.trail.length - 1 ? { pos: s.pos + 1, selection: s.trail[s.pos + 1] } : s)),
  jumpTo: (i) =>
    set((s) => (i >= 0 && i < s.trail.length ? { pos: i, selection: s.trail[i] } : s)),

  closeTab: (i) =>
    set((s) => {
      if (i < 0 || i >= s.trail.length) return s;
      const trail = s.trail.filter((_, k) => k !== i);
      let pos = s.pos;
      if (i < pos) pos -= 1;
      else if (i === pos) pos = Math.min(pos, trail.length - 1);
      pos = Math.max(-1, Math.min(pos, trail.length - 1));
      return { trail, pos, selection: pos >= 0 ? trail[pos] : null };
    }),
  closeOthers: (i) =>
    set((s) => {
      const keep = s.trail[i];
      if (!keep) return s;
      return { trail: [keep], pos: 0, selection: keep };
    }),
  closeAll: () => set({ trail: [], pos: -1, selection: null }),

  setViewerTab: (viewerTab) => set({ viewerTab }),
  toggleViewerMaximized: () => set((s) => ({ viewerMaximized: !s.viewerMaximized })),
  setMainView: (mainView) => set({ mainView }),
  setSearch: (search) => set({ search }),
  setCategoryFilter: (categoryFilter) => set({ categoryFilter }),
  setThicknessFilter: (thicknessFilter) => set({ thicknessFilter }),
}));
