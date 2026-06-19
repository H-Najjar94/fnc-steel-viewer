import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import type { ProjectIndex, PartGeometry, Workbook } from "../types";

/** Open a file in its default OS application (AutoCAD, a PDF reader, etc.). */
export async function openInDefaultApp(path: string): Promise<void> {
  await openPath(path);
}

/** Open the OS folder picker; returns the chosen path or null. */
export async function pickFolder(): Promise<string | null> {
  const res = await open({ directory: true, multiple: false, title: "Open FNC project folder" });
  if (typeof res === "string") return res;
  return null;
}

export async function scanProject(
  root: string,
  useCache = true,
  excludes: string[] = []
): Promise<ProjectIndex> {
  return invoke<ProjectIndex>("scan_project", { root, useCache, excludes });
}

export async function getPartGeometry(nc1Path: string): Promise<PartGeometry> {
  return invoke<PartGeometry>("get_part_geometry", { nc1Path });
}

export async function readTextFile(path: string): Promise<string> {
  return invoke<string>("read_text_file", { path });
}

export async function readFileBytes(path: string): Promise<Uint8Array> {
  const arr = await invoke<number[]>("read_file_bytes", { path });
  return new Uint8Array(arr);
}

export async function readExcel(path: string): Promise<Workbook> {
  return invoke<Workbook>("read_excel", { path });
}

export interface DxfRef {
  mark: string;
  path: string;
}

/** List every .dxf cut file in a project, keyed by filename mark. */
export async function listDxf(root: string, excludes: string[] = []): Promise<DxfRef[]> {
  return invoke<DxfRef[]>("list_dxf", { root, excludes });
}

/** Persist extracted components next to the project; returns the written path. */
export async function saveComponents(root: string, content: string): Promise<string> {
  return invoke<string>("save_components", { root, content });
}

/** Load previously-saved components JSON, or null if none. */
export async function loadComponents(root: string): Promise<string | null> {
  return invoke<string | null>("load_components", { root });
}
