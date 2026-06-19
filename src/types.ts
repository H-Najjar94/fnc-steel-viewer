// Mirror of the Rust structs returned by Tauri commands.

export interface Part {
  mark: string;
  name: string;
  category: string; // "Plate" | "Profile"
  profile: string;
  profile_type: string;
  material: string;
  length_mm: number;
  width_mm: number;
  height_mm: number;
  flange_t_mm: number;
  web_t_mm: number;
  radius_mm: number;
  weight_per_m: number;
  weight_kg: number;
  quantity: number;
  thickness_group: string | null;
  parent_assembly: string;
  nc1_path: string | null;
  dxf_path: string | null;
  pdf_path: string | null;
}

export interface DrawingRef {
  kind: string; // "Assembly" | "Single Part" | "Revision" | "Erection" | "Drawing"
  path: string;
}

export interface Assembly {
  mark: string;
  name: string;
  dwg_path: string | null;
  pdf_path: string | null;
  drawings: DrawingRef[];
  part_marks: string[];
}

export interface Report {
  name: string;
  path: string;
  ext: string;
}

export interface Stats {
  assemblies: number;
  parts: number;
  part_instances: number;
  total_weight_kg: number;
  pdfs: number;
  dwgs: number;
  nc1: number;
  dxf: number;
  by_category: Record<string, number>;
}

export interface ProjectIndex {
  root: string;
  name: string;
  logo_path: string | null;
  ifc_path: string | null;
  assemblies: Assembly[];
  parts: Part[];
  reports: Report[];
  stats: Stats;
}

export interface Hole {
  x: number;
  y: number;
  d: number;
}

export interface PartGeometry {
  mark: string;
  kind: string; // "plate" | "profile"
  profile: string;
  profile_type: string;
  length_mm: number;
  height_mm: number;
  width_mm: number;
  flange_t_mm: number;
  web_t_mm: number;
  radius_mm: number;
  outline: [number, number][];
  thickness_mm: number;
  holes: Hole[];
}

export interface SheetData {
  name: string;
  rows: string[][];
}

export interface Workbook {
  path: string;
  sheets: SheetData[];
}

// A selectable item in the UI: either a single part or an assembly.
export type SelectionKind = "part" | "assembly";
export interface Selection {
  kind: SelectionKind;
  mark: string;
}
