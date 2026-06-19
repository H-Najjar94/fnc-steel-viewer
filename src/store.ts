import { create } from "zustand";
import type { ProjectIndex, Part, Assembly, Selection } from "./types";
import type { AssemblyPart as IfcAssemblyPart } from "./lib/ifc";
import { scanProject } from "./lib/api";
import { findProject } from "./config";

export type { IfcAssemblyPart };

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
      const project = await scanProject(root, useCache, findProject(root)?.exclude ?? []);
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
