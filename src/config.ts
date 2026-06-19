export interface ProjectDef {
  name: string;
  root: string;
  /** Path prefixes to skip when scanning (keeps nested projects isolated). */
  exclude?: string[];
}

const ELNAGAR_ROOT = "C:/Users/user/Documents/taff/ELNAGAR-IFF-REV00/ELNAGAR-IFF-REV00";

// Known projects shown in the project switcher. Each is scanned in isolation.
export const PROJECTS: ProjectDef[] = [
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
];

/** Project opened automatically on launch. */
export const DEFAULT_PROJECT_ROOT: string | null = PROJECTS[0].root;

export function findProject(root: string): ProjectDef | undefined {
  return PROJECTS.find((p) => p.root === root);
}
