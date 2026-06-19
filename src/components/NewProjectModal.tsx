import { useState } from "react";
import { useStore } from "../store";
import { pickFolder, scanProject } from "../lib/api";
import { addCustomProject } from "../config";
import { num } from "../lib/format";
import type { ProjectIndex } from "../types";

export default function NewProjectModal({ onClose }: { onClose: () => void }) {
  const openProject = useStore((s) => s.openProject);
  const [root, setRoot] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [preview, setPreview] = useState<ProjectIndex | null>(null);
  const [error, setError] = useState<string | null>(null);

  const choose = async () => {
    const folder = await pickFolder();
    if (!folder) return;
    setRoot(folder);
    setPreview(null);
    setError(null);
    setScanning(true);
    try {
      // Fresh scan (no cache) so the report reflects exactly what's in the folder.
      const idx = await scanProject(folder, false, []);
      setPreview(idx);
    } catch (e) {
      setError(String(e));
    } finally {
      setScanning(false);
    }
  };

  const addAndOpen = () => {
    if (!root) return;
    addCustomProject(root, preview?.name);
    openProject(root, false);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-fnc-border bg-fnc-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-fnc-border px-6 py-4">
          <h2 className="text-lg font-semibold text-white">Add a new project</h2>
          <button onClick={onClose} className="text-fnc-steel transition hover:text-white">
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <p className="mb-4 text-sm text-fnc-steel">
            Point the app at a project folder. It is scanned <b>locally</b> (nothing is uploaded)
            and indexed automatically. To get the full experience — searchable catalog, 3D,
            drawings, CNC and reports — include the files below. The folder layout is flexible;
            files are recognized by their extension and name.
          </p>

          <Guide />

          <div className="mt-5 rounded-lg border border-fnc-border bg-fnc-bg/40 p-4">
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={choose}
                className="rounded-lg bg-fnc-red px-5 py-2.5 text-sm font-medium text-white transition hover:bg-fnc-red-dark"
              >
                Choose project folder…
              </button>
              {root && (
                <span className="truncate text-xs text-fnc-steel" title={root}>
                  {root}
                </span>
              )}
            </div>

            {scanning && (
              <div className="mt-4 flex items-center gap-2 text-sm text-fnc-steel">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-fnc-red border-t-transparent" />
                Scanning folder…
              </div>
            )}

            {error && (
              <p className="mt-4 rounded-md bg-red-950/60 p-3 text-sm text-red-300">{error}</p>
            )}

            {preview && !scanning && <Report idx={preview} />}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-fnc-border px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-md border border-fnc-border px-4 py-2 text-sm text-fnc-steel transition hover:bg-fnc-panel-2 hover:text-white"
          >
            Cancel
          </button>
          <button
            onClick={addAndOpen}
            disabled={!preview}
            className="rounded-md bg-fnc-red px-5 py-2 text-sm font-medium text-white transition hover:bg-fnc-red-dark disabled:opacity-40"
          >
            Add &amp; open
          </button>
        </div>
      </div>
    </div>
  );
}

function Guide() {
  return (
    <div className="space-y-3 text-sm">
      <Req
        title="Marks are the key — name every file by its mark"
        body="Each part/assembly is identified by its mark = the leading token of the filename, before “ - ” or the first space. Examples: C48 - COLUMN.dwg → C48, IF106 - PL10mm.pdf → IF106, 204.dxf → 204. Keep the mark identical across a part's DWG / PDF / NC1 / DXF so the app links them automatically."
      />
      <Req
        title="Drawings — .pdf (and .dwg)"
        body="Put a PDF for each assembly and single part. The app shows PDFs in-app (DWG can't be rendered, but its PDF twin is used). Name them by mark. Helpful keywords in the path/name: “Assembly”, “Single”, “Erection”, “Revision/تعديل” — these tag and prioritize the drawings."
      />
      <Req
        title="3D — choose ANY one of these"
        body="(a) DSTV .nc1 per part — best: exact 3D plus dimensions, material, weight and parent assembly. (b) Per-part .dxf cut files — plates extrude instantly from the outline (thickness read from a text like “…+PL8+S235JR”). (c) A single building .ifc (Tekla export) — full assembled model plus all parts and marks. Provide .nc1/.dxf for fast per-part 3D, an .ifc for the whole building, or both."
      />
      <Req
        title="CNC — .nc1 + .dxf"
        body="DSTV .nc1 files give the raw CNC tab and the most accurate 3D. Per-part .dxf cut files give the 2D cut view and (for plates) the 3D. Plate thickness is taken from a parent folder named like “PL10”, or from the DXF annotation text."
      />
      <Req
        title="Reports — .xlsx / .xlsb / .xls"
        body="BOM / MTO / single-part BOM workbooks are loaded into searchable tables in the Reports tab."
      />
      <Req
        title="Logo (optional)"
        body="An image file with “logo” in its name is picked up as the project brand mark."
      />
    </div>
  );
}

function Req({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-fnc-border bg-fnc-bg/30 p-3">
      <div className="mb-1 flex items-center gap-2 font-medium text-white">
        <span className="text-fnc-red">●</span>
        {title}
      </div>
      <p className="pl-4 text-fnc-steel">{body}</p>
    </div>
  );
}

function Report({ idx }: { idx: ProjectIndex }) {
  const s = idx.stats;
  const plates = s.by_category["Plate"] || 0;
  const profiles = s.by_category["Profile"] || 0;
  const has3D = !!idx.ifc_path || s.nc1 > 0 || s.dxf > 0;
  return (
    <div className="mt-4">
      <div className="mb-2 text-sm font-semibold text-white">
        Found in <span className="text-fnc-red">{idx.name}</span>
      </div>
      <div className="mb-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
        <Stat label="Assemblies" value={num(s.assemblies)} />
        <Stat label="Parts" value={num(s.parts)} />
        <Stat label="Plates" value={num(plates)} />
        <Stat label="Profiles" value={num(profiles)} />
        <Stat label="Drawings (PDF)" value={num(s.pdfs)} />
        <Stat label="DWG" value={num(s.dwgs)} />
        <Stat label="CNC .nc1" value={num(s.nc1)} />
        <Stat label="DXF" value={num(s.dxf)} />
        <Stat label="Reports" value={num(idx.reports.length)} />
      </div>
      <div className="space-y-1">
        <Check ok={s.assemblies > 0 || s.parts > 0} label="Catalog (assemblies / parts)" />
        <Check ok={has3D} label={`3D model ${idx.ifc_path ? "(IFC)" : s.nc1 > 0 ? "(NC1)" : s.dxf > 0 ? "(DXF)" : ""}`} />
        <Check ok={s.pdfs > 0} label="Drawings (PDF)" />
        <Check ok={s.nc1 > 0 || s.dxf > 0} label="CNC data (NC1 / DXF)" />
        <Check ok={idx.reports.length > 0} label="Reports (Excel)" />
      </div>
      {s.assemblies === 0 && s.parts === 0 && (
        <p className="mt-3 rounded-md bg-amber-950/40 p-2 text-xs text-amber-300">
          No assemblies or parts were recognized. Check that files are named by mark and that the
          folder contains .dwg / .pdf / .nc1 / .dxf / .ifc files.
        </p>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-fnc-steel">{label}</span>
      <span className="font-medium text-white">{value}</span>
    </div>
  );
}

function Check({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className={ok ? "text-fnc-green" : "text-fnc-steel/50"}>{ok ? "✓" : "○"}</span>
      <span className={ok ? "text-white" : "text-fnc-steel"}>{label}</span>
    </div>
  );
}
