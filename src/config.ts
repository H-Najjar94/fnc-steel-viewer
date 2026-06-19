export interface ProjectDef {
  name: string;
  root: string;
  /** Path prefixes to skip when scanning (keeps nested projects isolated). */
  exclude?: string[];
  /** True for projects the user added at runtime (persisted in localStorage). */
  custom?: boolean;
}

const ELNAGAR_ROOT = "C:/Users/user/Documents/taff/ELNAGAR-IFF-REV00/ELNAGAR-IFF-REV00";
const KHASHROM_ROOT = "C:/Users/user/Documents/taff/fnc-viewer/projects/khashrom";

// Built-in projects shipped with the app. Each is scanned in isolation.
export const BUILTIN_PROJECTS: ProjectDef[] = [
  {
    name: "ELNAGAR-IFF-REV00",
    root: ELNAGAR_ROOT,
    // The Madar project lives inside this folder — exclude it so they don't mix.
    exclude: [`${ELNAGAR_ROOT}/madar`],
  },
  {
    name: "Madar Group",
    root: `${ELNAGAR_ROOT}/madar/Madar Group _ For Fabrication/Madar Group ~ For Fabrication`,
  },
  {
    name: "khashrom",
    root: KHASHROM_ROOT,
  },
];

/** Project opened automatically on launch. */
export const DEFAULT_PROJECT_ROOT: string | null = BUILTIN_PROJECTS[0].root;

const CUSTOM_KEY = "fnc.customProjects";

function normRoot(root: string): string {
  return root.replace(/\\/g, "/").replace(/\/+$/, "");
}

/** User-added projects, persisted in localStorage. */
export function getCustomProjects(): ProjectDef[] {
  try {
    const list = JSON.parse(localStorage.getItem(CUSTOM_KEY) || "[]") as ProjectDef[];
    return Array.isArray(list) ? list.map((p) => ({ ...p, custom: true })) : [];
  } catch {
    return [];
  }
}

function saveCustomProjects(list: ProjectDef[]) {
  localStorage.setItem(CUSTOM_KEY, JSON.stringify(list));
}

/** All projects shown in the switcher / splash (built-in first, then custom). */
export function getAllProjects(): ProjectDef[] {
  const custom = getCustomProjects().filter(
    (c) => !BUILTIN_PROJECTS.some((b) => normRoot(b.root) === normRoot(c.root))
  );
  return [...BUILTIN_PROJECTS, ...custom];
}

/** Add (or update) a user project. Derives a name from the folder if absent. */
export function addCustomProject(root: string, name?: string): ProjectDef {
  const r = normRoot(root);
  const def: ProjectDef = {
    root: r,
    name: name?.trim() || r.split("/").filter(Boolean).pop() || r,
    custom: true,
  };
  const list = getCustomProjects().filter((p) => normRoot(p.root) !== r);
  list.unshift(def);
  saveCustomProjects(list);
  return def;
}

export function removeCustomProject(root: string) {
  const r = normRoot(root);
  saveCustomProjects(getCustomProjects().filter((p) => normRoot(p.root) !== r));
}

export function findProject(root: string): ProjectDef | undefined {
  const r = normRoot(root);
  return getAllProjects().find((p) => normRoot(p.root) === r);
}

// Back-compat: some modules import PROJECTS directly.
export const PROJECTS = BUILTIN_PROJECTS;
