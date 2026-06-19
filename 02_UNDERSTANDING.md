# 02 — UNDERSTANDING

> My working mental model of this project. Built up over sessions.
> Update this whenever I learn something new about how things fit together.

## What the project is for
A complete shop-fabrication package for a steel building (looks like a portal-frame
/ mezzanine structure: columns + rafters + mezzanine beams + bracing + cold-formed
secondary members). The data flows: **model → assembly drawings → single parts →
CNC machine files → BOM/MTO reports** so the workshop can cut, drill, and assemble.

## How the folders relate
- **ASSEMBLY** = what gets welded/bolted together on the shop floor. Each `.dwg`
  has a 1:1 `.pdf` for printing/shop use. Same base filename in both.
- **SINGLE** = the individual loose parts that make up the assemblies (plates by
  thickness, profile cuts).
- **CNC FILES** = the machine-readable version of the single parts:
  - `DSTV_*` (`.nc1`) drives the CNC line (saw/drill/coper for profiles; nesting
    for plates).
  - `NC_dxf` (`.dxf`) drives the cutting table (laser/plasma).
  - PLATE parts are organized **by thickness folder** (PL2…PL30) — thickness is the
    key sorting dimension because each is cut from a different stock sheet.
- **REPORTS** = quantities and materials rolled up from the model (BOM = what to
  build; MTO = what raw material to buy).

## Naming conventions observed
- Assembly marks = `PREFIX + number + " - " + DESCRIPTION` (e.g. `C12 - COLUMN`,
  `RF7 - RAFTER`, `BU-3 - MEZZ BEAM`). Some carry a ` - Rev 00` suffix.
- Plate single-parts use `IF###` marks (e.g. `IF106`), filed by thickness.
- Profile CNC files are numeric (e.g. `1131.nc1` / `1131.dxf`).

## Cross-file integrity rules (important)
- For a plate part, the SAME mark should exist in all three places:
  `DSTV_Plates/<PLxx>/IF###.nc1`, `NC_dxf/<PLxx>/IF###.dxf`, and
  `SINGLE/PDF/PLATES/<PLxx>/IF### - PLxxmm.pdf`. Counts currently match (1276 each).
- For assemblies, every `ASSEMBLY/CAD/<x>.dwg` should have `ASSEMBLY/PDF/<x>.pdf`.
- A plate's folder thickness (PLxx) must equal the thickness stated inside the part.

## Open questions / things I don't yet know
- Exact source CAD/detailing software (naming & DSTV output is consistent with
  Tekla Structures, but unconfirmed).
- Whether REV00 is the issued-for-fabrication baseline or a draft.
- Why some assemblies carry ` - Rev 00` in the name and others don't.
- Contents of the BOM/MTO spreadsheets (binary `.xlsb` — not yet opened).

## Constraints I operate under here
- I cannot meaningfully read `.dwg` as text/geometry. BUT: `.nc1` IS plain DSTV text
  (fully parseable) and `.xlsb`/`.xlsx` are readable via the `calamine` Rust crate.
  I work at the level of file inventory, naming, counts, structure, consistency —
  plus parsed part data from `.nc1` and report rows from the spreadsheets.

## FNC Steel Viewer app (built 2026-06-18)
A desktop app to read/interact with these files lives in a SIBLING folder:
`c:\Users\user\Documents\taff\fnc-viewer\` (NOT inside this data folder).
- Stack: React + TS + Vite + Tauri v2 + Rust. Points at a project folder at runtime.
- Rust (`src-tauri/src/`): `index.rs` scans + builds the relational model;
  `dstv.rs` parses NC1 (validated: IPE450 props match); `excel.rs` reads xlsx/xlsb.
- DSTV ST header field order (FNC export): 0 order, 1 drawing, 2 mark, 3 length,
  4 qty, 5 profile, 6 material, 7 height/width, 8 flange-width, 9 flange-t, 10 web-t,
  11 radius, 12 weight (kg/m for profiles, **kg/m² for plates**), then text:
  parent-assembly mark, part name.
- Per-part 3D is reconstructed from NC1; full building 3D uses IFC when available
  (web-ifc viewer is wired, and Madar now has `MADAR GROUP.ifc`).
- Dev check: `cd fnc-viewer/src-tauri && cargo run --example scan -- "<project>"`.
