# 03 — UPDATES HISTORY

> Append-only log of changes and work done, newest at top.
> One entry per session (or per significant action). Never rewrite past entries.

Format:
```
## YYYY-MM-DD — short title
- what changed / what I did
- files touched
- decisions made / why
```

---

## 2026-06-19 — Madar drawings via extracted PDFs + multi-drawing selector
- Madar has no in-app-renderable drawings (DWG only). Resolved by using the
  per-page PDFs under `_page_extract/` (named by mark). Scanner generalized: links
  PDFs by the word "assembly"/"single" anywhere in the path (not just `/assembly/`)
  + an any-PDF-by-mark fallback. Madar's 787 items now show their drawings in-app.
- Each mark can have several drawings: Assembly, Single Part, Erection, and
  **Revision** (the Arabic `تعديل` folder). Scanner attaches a sorted `drawings[]`
  per assembly; new `DrawingViewer` shows a selector (Revision first, starred).
- DWG→STL/IFC headless conversion (AutoCAD accoreconsole) abandoned for now — it
  HANGS on `3D-Model.dwg` at open (proxy/AEC prompt). The 3D model still needs a
  one-time GUI export (IFC best, else STL) to view in-app.

## 2026-06-19 — Rolled back experimental CAD tab
- removed the temporary `CAD` tab and its helper component after user review
- restored the viewer tab set to the prior state
- rebuilt successfully to verify the rollback

## 2026-06-19 — Experimental CAD tab added to viewer
- added a temporary `CAD` tab in `fnc-viewer` so you can test the free in-app DXF viewer path before deciding whether to keep it
- validated with `npm run build`
- launched the dev app for user review
- updated the prototype so assemblies open their drawing PDF in the `CAD` tab too, making the test valid for your `1-BR8` case

## 2026-06-19 — App: multi-project, 3D click-to-pick fix, Madar DWG viewing
- **3D click-to-pick (ELNAGAR/IFC):** click a member in the building → selects its
  part/assembly. Hover outlines it. Recovered part marks from the IFC `Reference`
  property (joins to CNC files even when DSTV parent-linking misses them), stripping
  Tekla `(?)` flags. Added a CNC-coverage panel per assembly.
  - **Bug fixed:** `three-mesh-bvh` `computeBoundsTree()` reorders the index buffer by
    default, breaking the triangle→element map (picked wrong/behind part). Fix:
    `computeBoundsTree({ indirect: true })` to keep original order. Verified headless.
- **Multi-project + isolation:** project switcher (TopBar dropdown + Splash). The
  Madar project lives INSIDE the ELNAGAR folder, so ELNAGAR's scan now EXCLUDES the
  nested `madar/` path (`scan(root, excludes)`), keeping them separate.
- **Madar dataset:** 786 DWG, 173 DXF, 4 Excel, no IFC, no NC1 → limited features.
  DWG can't render in a web app (proprietary). In progress: AutoCAD STL (3D) +
  LibreDWG/DXF (2D) to view DWGs for free. See [[06_decisions_and_preferences]].

## 2026-06-19 — Madar PDF page extraction added
- split the `Madar Group ~ For Fabrication` PDFs into single-page PDFs
- wrote a per-page manifest at `madar/Madar Group _ For Fabrication/Madar Group ~ For Fabrication/_page_extract/manifest.csv`
- normalized extracted labels so leading `x-` / `X-` prefixes are removed from page names
- switched output filenames from page-number prefixes to part-name-based names; duplicate labels in the same source PDF get `__2`, `__3`, etc.

## 2026-06-18 — IFC building model added + viewer refinements
- User added `R02.ifc` (47 MB, Tekla Structures 2023 export, IFC2X3) at project root,
  plus `R02-IFC/` (a Part Mark Key Plan dwg+pdf) and `R02-IFC.rar`.
- App now: re-scans fresh on launch (picks up newly added files), auto-detects the
  IFC, and opens on the full building model. IFC viewer merges geometry by colour
  (few batches) for performance on the large file.
- PDF drawing controls reworked for the workshop trackpad: two-finger scroll = zoom
  (pinch isn't delivered by WebView2), click-drag = move inside, +/−/Fit buttons.
- Added window fullscreen (F11) + viewer Maximize; HiDPI-crisp PDF rendering.

## 2026-06-18 — Built FNC Steel Viewer desktop app
- Created a new desktop app at `c:\Users\user\Documents\taff\fnc-viewer\`
  (React + TS + Vite + Tauri v2 + Rust) to read & interact with project files.
- Rust backend: scans a project folder, parses all DSTV `.nc1`, builds a relational
  index (assemblies ↔ parts ↔ file paths), reads `.xlsx`/`.xlsb` via calamine.
- Frontend: FNC-branded splash, searchable virtualized catalog, detail panel, and
  viewer tabs — 3D (DSTV part reconstruction + IFC building via web-ifc), PDF
  (pdf.js), CNC (DXF + raw NC1), Data, and Reports.
- Verified against the real ELNAGAR data: 1090 assemblies, 1281 parts, 100% file
  linking (pdf/dxf/parent), reports read OK.
- **Fixed a weight bug:** DSTV weight field is kg/m for profiles but kg/m² for
  plates → plate weight = length×width×kg/m². Corrected total ≈ 605 t (was 1727 t).
- See app's own architecture notes in [[02_understanding]] §"FNC Steel Viewer app".

## 2026-06-18 — Defined the operating protocol
- Rewrote `04_INSTRUCTIONS.md` with "7 rules that make these files worth keeping"
  (read at start, trust-but-verify, update at end, capture corrections immediately,
  one-fact-one-place, keep lean, never leave stale info) + a 3-question close-out.

## 2026-06-18 — Added current-state and decisions files
- Created `05_CURRENT_STATE.md` (in progress / next / blocked) and
  `06_DECISIONS_AND_PREFERENCES.md` (decisions log + how-to-work preferences).
- Updated `CLAUDE.md` to auto-load all 6 files.

## 2026-06-18 — Initial session-context setup
- Surveyed the project structure (read-only inventory, no files modified).
- Created the 4 session-context files at project root:
  - `01_INFO.md`, `02_UNDERSTANDING.md`, `03_UPDATES_HISTORY.md`, `04_INSTRUCTIONS.md`
- Created `CLAUDE.md` so these files auto-load at the start of each session.
- Baseline counts recorded: ~6,026 files; 1,090 assembly DWG+PDF; 1,276 plate
  parts (.nc1/.dxf/PDF each); plate thicknesses PL2–PL30.
- No engineering data was changed.
