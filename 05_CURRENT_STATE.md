# 05 — CURRENT STATE / TODO

> What's happening right now. The first thing to check when resuming work.
> Keep this current: move finished items into 03_UPDATES_HISTORY.md and delete
> them here. This file is about NOW and NEXT, not the past.

## Status (one line)
FNC Steel Viewer app: ELNAGAR fully working (3D/IFC/parts/click-to-pick). Added a
2nd project (Madar) with multi-project switching + isolation. The `CAD` tab is
back and uses only CAD files: DXF for parts, DWG for assemblies.

## In progress
- Converting Madar `3D-Model.dwg` (76 MB) → STL via the installed AutoCAD 2026
  headless console (`accoreconsole.exe` + STLOUT), to render it in-app with three
  STLLoader. Output target: `C:/tmp/madarconv/madar3d.stl`.
- Plan (user chose "do both"): build LibreDWG-based in-app 2D DWG viewer AND the
  AutoCAD-STL 3D import for Madar.

## Next up / to do
- [ ] Finish STL render path: scanner detects a model `.stl`, 3D viewer loads it.
- [ ] 2D DWG → DXF conversion (LibreDWG, or accoreconsole) + render in the drawing tab.
- [ ] Run app, switch to Madar via the new project dropdown, verify.
- [ ] (Optional) Get an IFC export for Madar → full in-app 3D like ELNAGAR.
- [ ] You to fill in project intent & facts (building type, design code) → 01_INFO.md

## Blocked / waiting on
- (nothing)

## Notes for next session
- App lives in a SIBLING folder, not inside this data folder. Stack: React+TS+Vite+
  Tauri v2+Rust. Dev validation tool: `cargo run --example scan -- "<project>"`.
- Backend facts confirmed: 1090 assemblies, 1281 parts (1276 plates / 5 profiles),
  ~605 t total, 3 reports, logo at project root.
- Madar page extraction output lives at `madar/Madar Group _ For Fabrication/Madar Group ~ For Fabrication/_page_extract/`.
- Page filenames are part-name based; repeats in the same source PDF use `__2`,
  `__3`, etc.
- The `CAD` tab is CAD-only now: DXF in-app for parts, DWG source/open button for
  assemblies.
- The 6 context files auto-load via CLAUDE.md.
