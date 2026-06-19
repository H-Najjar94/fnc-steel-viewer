# 03 - UPDATES HISTORY

> Append-only log of changes and work done, newest at top.
> One entry per session (or per significant action). Never rewrite past entries.

Format:
```text
## YYYY-MM-DD - short title
- what changed / what I did
- files touched
- decisions made / why
```

---

## 2026-06-19 - Full plate specs for DXF parts (length/width/weight/holes)
- DXF plate parts previously showed only thickness/material (length/width/weight
  0). Extended the Rust scanner: `dxf_plate_info` now fully parses the DXF
  geometry (group-code/value walk over LWPOLYLINE/POLYLINE+VERTEX/CIRCLE):
  picks the largest closed CUT loop, computes bbox → length (long side) / width
  (short side), counts holes (circles + inner CUT loops inside the outline), and
  weight = net area (outer minus holes) × thickness × 7.85e-6 kg/mm³ (steel).
  Maps length_mm/height_mm(=width)/flange_t_mm(=thickness)/weight_kg so the
  detail panel matches the .nc1 parts. Quantity stays 1 (not in the DXF).
- Cache bumped to `v3-dxfspecs`. Files: `src-tauri/src/index.rs`, `lib.rs`. cargo clean.

## 2026-06-19 - "Add new project" with onboarding + auto-index
- Projects are no longer hardcoded only: `config.ts` now has a custom-project
  registry persisted in localStorage (`fnc.customProjects`) with
  getAllProjects/addCustomProject/removeCustomProject; findProject searches all.
  Built-ins kept (BUILTIN_PROJECTS); `PROJECTS` alias retained for compatibility.
- New `NewProjectModal.tsx`: a guide listing exactly what's needed to match the
  first project — mark-based filenames; PDF (+DWG) drawings; 3D via ANY of
  `.nc1` / per-part `.dxf` / a single `.ifc`; CNC `.nc1`+`.dxf` (+ PLxx thickness
  folders); Excel reports; optional logo. User clicks "Choose folder" → fresh
  `scan_project` runs → a readiness report shows counts (assemblies/parts/plates/
  profiles/pdf/dwg/nc1/dxf/reports) + ✓/○ checks (catalog, 3D, drawings, CNC,
  reports). "Add & open" persists it and opens it. The existing Rust scanner does
  all indexing — no per-project code needed.
- Wired into Splash ("+ Add new project") and the TopBar switcher
  ("+ Add new project…"); both list built-in + custom (marked "(added)").
- Files: `src/config.ts`, `src/components/NewProjectModal.tsx` (new),
  `src/components/Splash.tsx`, `src/components/TopBar.tsx`. tsc clean.

## 2026-06-19 - Madar parts fast from per-part DXF (like ELNAGAR's .nc1)
- Root cause of Madar slowness: it has NO `.nc1`; the only 3D source was the one
  71 MB IFC, so any part needed the whole model opened + a mark scan. ELNAGAR is
  instant because each part has a tiny DSTV `.nc1` parsed by Rust on click.
- Fix (user chose "use the per-part DXF files"): Madar ships per-part DXF cut
  files (`5-DXF Files/204.dxf`…) with the contour on layer `CUT`, holes as
  `CIRCLE`, and a TEXT entity like `28+PL8+S235JR` (thickness PL8, material).
  - Rust scanner now registers every DXF (no matching `.nc1`) as a **Plate part**
    — mark from filename, thickness/material parsed from the DXF text
    (`dxf_plate_meta`), `dxf_path` set. So the catalog + sidebar Plates populate
    with **no extraction and no IFC**. Cache version bumped to `v2-dxfparts`.
  - New `src/lib/dxfGeometry.ts` `buildDxfPlateGeometry()`: parses the DXF
    (dxf-parser), picks the largest closed CUT loop as the outline, circles/inner
    CUT loops as holes (bulge arcs sampled), extrudes by thickness.
  - New `DxfPartViewer.tsx` renders it (orbit/zoom/pan, wireframe, fit) — instant,
    like the DSTV part view. Viewer3D order: `.nc1`→DSTV; else `dxf_path`→DXF
    extrude; else IFC isolate; else message.
  - `withComponents` now also back-fills a DXF part's parent assembly from saved
    IFC components when present.
- Profiles/beams without a DXF still fall back to the IFC path. tsc + cargo clean.

## 2026-06-19 - Part 3D from IFC + precomputed index saved with components
- IFC-derived parts (e.g. plate `463`, `1-BR1`) have no DSTV `.nc1`, so the 3D
  tab showed "No CNC geometry". Added `getPartGroup(mark)` to the IFC model
  (isolates one representative piece via `GetFlatMesh`) and a new
  **IfcPartViewer** (orbit/zoom/pan, wireframe, fit-view). Viewer3D now: `.nc1`
  → DSTV reconstruction; else IFC present → isolate part from IFC; else message.
- Perf: the part-mark→expressID **index** is now built once during component
  extraction and **persisted in the save** (`_fnc_components.json` → `index`),
  alongside `dxf`. On reload the store loads it into `ifcPartIndex`, and
  IfcPartViewer passes the known IDs to `getPartGroup` so part 3D **skips the
  mark scan** (no more "Building part 3D… %" rebuild). Save button now shows a
  prepare-index progress %.
- Files: `src/lib/ifc.ts` (getPartGroup/getPartIndex/buildGroupFromIds, index
  built in getComponents), `src/components/viewers/IfcPartViewer.tsx` (new),
  `src/components/viewers/Viewer3D.tsx` (routing), `src/store.ts` (ifcPartIndex +
  applyComponents index arg + openProject loads saved index), `Components.tsx`
  (save persists index + applies it live). tsc clean.

## 2026-06-19 - Components folded into catalog (sidebar + assembly parts)
- Saved IFC components now merge into the catalog data model: synthetic `Part`s
  added to `project.parts` (Plate→Plate, Beam/Column/Member→Profile), stats
  recomputed (Plates/Profiles/Part instances/All items), plate thickness groups
  parsed from profile (e.g. `PL5*130`→`PL5`). Makes the left sidebar counts rise
  and turns assembly parts-panel rows into clickable links. Merge runs on Save
  (live) and auto on project open (reads `_fnc_components.json`). Deduped by mark;
  never overwrites real DSTV catalog parts.
- Files: `src/store.ts` (componentToPart/withComponents/applyComponents +
  openProject auto-merge), `src/components/Components.tsx` (apply on save).

## 2026-06-19 - Components: progress bar + Save to project (relations & DXF linking)
- Components panel now shows a real **progress bar** with two phases — "Loading
  model" (IFC parse/geometry, driven by `loadIfcModel` onProgress) then
  "Extracting components" — instead of just a percent on the button.
- Added **"Save to project"**: persists extracted components to
  `<root>/_fnc_components.json` via new Rust command `save_components`. On panel
  mount, `load_components` reads it back so components show instantly without
  re-extracting (labelled "loaded from saved …"). "Re-extract" forces a fresh pull.
- **Active linking:** new Rust command `list_dxf(root, excludes)` indexes every
  `.dxf` by filename mark; the table now has a **DXF "open"** link per row
  (opens the cut file in the default app) and a header count of how many
  components resolve to a DXF. The **Assembly** column relation was already
  clickable (selectByMark) — both relation + linking are now "active".
- Files: `src-tauri/src/lib.rs` (3 commands + DxfRef, registered), `src/lib/api.ts`
  (listDxf/saveComponents/loadComponents wrappers + DxfRef), `src/components/Components.tsx`
  (rewrite), `src/index.css` (--color-fnc-green). tsc + cargo check clean.

## 2026-06-19 - Madar IFC wired (Tekla 19.0 mark extraction)
- Madar gained `MADAR GROUP.ifc` (71 MB, Tekla Structures 19.0, IFC2X3, mm).
- Its older export differs from R02: assembly Tag EMPTY, no `Reference` property.
  Marks live in psets: **`Assembly mark`** (e.g. `1-C8`, `1-R5`) and **`Part mark`**
  (e.g. `416`). They match the catalog marks (from DWG names like `1-C8`).
- Adapted `lib/ifc.ts`: new `readMarks()` reads `Part mark`/`Assembly mark` (+
  `Assembly/Cast unit Mark`) from psets as a fallback when Tag/`Reference` are empty.
  instanceCounts now derived from the assembly→instances map. Verified headless:
  ~200 distinct assembly marks recovered. Madar now has the full IFC experience
  (3D, isolate, parts list, instance counts, hover/click-to-pick), like ELNAGAR.

## 2026-06-19 - Madar IFC added to project data
- confirmed the Madar project folder now includes `MADAR GROUP.ifc`
- updated the project memory files so Madar is no longer marked "no IFC"
- kept the DWG/STL fallback decision as the backup path for projects without IFC

## 2026-06-19 - Madar drawings via extracted PDFs + multi-drawing selector
- Madar has no in-app-renderable drawings (DWG only). Resolved by using the
  per-page PDFs under `_page_extract/` (named by mark). Scanner generalized: links
  PDFs by the word "assembly" or "single" anywhere in the path plus an any-PDF-by-mark fallback.
- Each mark can have several drawings: Assembly, Single Part, Erection, and
  Revision (the Arabic `تعديل` folder). Scanner attaches a sorted `drawings[]`
  per assembly; new `DrawingViewer` shows a selector (Revision first, starred).
- DWG-to-STL/IFC headless conversion (AutoCAD accoreconsole) abandoned for now - it
  hangs on `3D-Model.dwg` at open (proxy/AEC prompt). The 3D model still needs a
  one-time GUI export (IFC best, else STL) to view in-app.

## 2026-06-19 - Rolled back experimental CAD tab
- removed the temporary `CAD` tab and its helper component after user review
- restored the viewer tab set to the prior state
- rebuilt successfully to verify the rollback

## 2026-06-19 - Experimental CAD tab added to viewer
- added a temporary `CAD` tab in `fnc-viewer` so you can test the free in-app DXF viewer path before deciding whether to keep it
- validated with `npm run build`
- launched the dev app for user review
- updated the prototype so assemblies open their drawing PDF in the `CAD` tab too, making the test valid for the `1-BR8` case

## 2026-06-19 - App: multi-project, 3D click-to-pick fix, Madar DWG viewing
- 3D click-to-pick (ELNAGAR/IFC): click a member in the building -> selects its
  part/assembly. Hover outlines it. Recovered part marks from the IFC `Reference`
  property (joins to CNC files even when DSTV parent-linking misses them), stripping
  Tekla `(?)` flags. Added a CNC-coverage panel per assembly.
- Bug fixed: `three-mesh-bvh` `computeBoundsTree()` reorders the index buffer by
  default, breaking the triangle-to-element map (picked wrong/behind part). Fix:
  `computeBoundsTree({ indirect: true })` to keep original order. Verified headless.
- Multi-project + isolation: project switcher (TopBar dropdown + Splash). The
  Madar project lives inside the ELNAGAR folder, so ELNAGAR's scan now excludes the
  nested `madar/` path (`scan(root, excludes)`), keeping them separate.
- Madar dataset: 786 DWG, 173 DXF, 4 Excel, no IFC, no NC1 -> limited features.
  DWG can't render in a web app (proprietary). In progress: AutoCAD STL (3D) +
  LibreDWG/DXF (2D) to view DWGs for free. See [[06_decisions_and_preferences]].

## 2026-06-19 - Madar PDF page extraction added
- split the `Madar Group ~ For Fabrication` PDFs into single-page PDFs
- wrote a per-page manifest at `madar/Madar Group _ For Fabrication/Madar Group ~ For Fabrication/_page_extract/manifest.csv`
- normalized extracted labels so leading `x-` / `X-` prefixes are removed from page names
- switched output filenames from page-number prefixes to part-name-based names; duplicate labels in the same source PDF get `__2`, `__3`, etc.

## 2026-06-18 - IFC building model added + viewer refinements
- User added `R02.ifc` (47 MB, Tekla Structures 2023 export, IFC2X3) at project root,
  plus `R02-IFC/` (a Part Mark Key Plan dwg+pdf) and `R02-IFC.rar`.
- App now re-scans fresh on launch (picks up newly added files), auto-detects the
  IFC, and opens on the full building model. IFC viewer merges geometry by colour
  (few batches) for performance on the large file.
- PDF drawing controls reworked for the workshop trackpad: two-finger scroll = zoom
  (pinch isn't delivered by WebView2), click-drag = move inside, +/-/Fit buttons.
- Added window fullscreen (F11) + viewer Maximize; HiDPI-crisp PDF rendering.

## 2026-06-18 - Built FNC Steel Viewer desktop app
- Created a new desktop app at `c:\Users\user\Documents\taff\fnc-viewer\`
  (React + TS + Vite + Tauri v2 + Rust) to read and interact with project files.
- Rust backend: scans a project folder, parses all DSTV `.nc1`, builds a relational
  index (assemblies <-> parts <-> file paths), reads `.xlsx`/`.xlsb` via calamine.
- Frontend: FNC-branded splash, searchable virtualized catalog, detail panel, and
  viewer tabs - 3D (DSTV part reconstruction + IFC building via web-ifc), PDF
  (pdf.js), CNC (DXF + raw NC1), Data, and Reports.
- Verified against the real ELNAGAR data: 1090 assemblies, 1281 parts, 100% file
  linking (pdf/dxf/parent), reports read OK.
- Fixed a weight bug: DSTV weight field is kg/m for profiles but kg/m^2 for plates;
  corrected total is about 605 t (was 1727 t).

## 2026-06-18 - Defined the operating protocol
- Rewrote `04_INSTRUCTIONS.md` with the session protocol, update rules, and close-out.

## 2026-06-18 - Added current-state and decisions files
- Created `05_CURRENT_STATE.md` and `06_DECISIONS_AND_PREFERENCES.md`.
- Updated `CLAUDE.md` so the six context files auto-load.

## 2026-06-18 - Initial session-context setup
- Surveyed the project structure (read-only inventory, no files modified).
- Created the 4 session-context files at project root:
  - `01_INFO.md`, `02_UNDERSTANDING.md`, `03_UPDATES_HISTORY.md`, `04_INSTRUCTIONS.md`
- Baseline counts recorded: about 6,026 files; 1,090 assembly DWG+PDF; 1,276 plate
  parts (`.nc1`/`.dxf`/PDF each); plate thicknesses PL2-PL30.
- No engineering data was changed.
