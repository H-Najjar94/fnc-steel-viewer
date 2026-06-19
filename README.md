# FNC Steel Viewer

A local desktop app for **FNC Steel Constructions** to read and interact with steel
detailing project folders — drawings, CNC data, parts and BOM/MTO reports — with a
3D view of the model. Built with **React + TypeScript + Vite + Tauri v2 + Rust**.
Files are read locally and never leave the machine.

## Features

- **Open any project folder** with the standard FNC structure (ASSEMBLY / SINGLE /
  CNC FILES / REPORTS). The Rust backend scans + indexes it (and caches the index).
- **Searchable parts catalog** — every assembly and single part, with profile,
  material, length, weight, quantity and parent assembly. Virtualized for thousands
  of items; search by mark / profile / name (e.g. `C48`, `IF106`, `IPE450`).
- **3D viewer**
  - **Per-part reconstruction** from DSTV `.nc1` (plates extruded from their contour;
    profiles built from section dimensions). Orbit / zoom / pan, fit, wireframe,
    view-cube. Shown on app start.
  - **Full building model** when an `.ifc` file is present in the project (web-ifc).
    Click a member to locate its part.
- **Drawing tab** — renders the `.pdf` drawings (pdf.js) with page navigation + zoom.
  Covers DWGs via their 1:1 PDF twins.
- **CNC tab** — renders the `.dxf` cut profile (SVG) alongside the raw DSTV `.nc1`.
- **Reports tab** — reads `.xlsx` and binary `.xlsb` BOM/MTO workbooks (calamine).

## Run / build

```bash
npm install
npm run tauri dev      # launch the app in development
npm run tauri build    # produce a Windows installer (NSIS/MSI)
```

Dev tool to scan a folder from the CLI (no GUI):

```bash
cd src-tauri
cargo run --example scan -- "C:/path/to/project"
```

## Architecture

```
src/                      React + TS frontend
  store.ts                Zustand state (project, selection, filters)
  types.ts                Shapes mirroring the Rust structs
  lib/api.ts              Tauri command bindings
  lib/dstvGeometry.ts     DSTV part -> three.js geometry
  components/             Splash, TopBar, Sidebar, Catalog, DetailPanel
  components/viewers/     Viewer3D, IfcViewer, PdfViewer, CncViewer, DataTab
src-tauri/src/
  index.rs                Folder scan + relational index (+ JSON cache)
  dstv.rs                 DSTV NC1 parser (header + AK/BO geometry)
  excel.rs                xlsx/xlsb reader (calamine)
  lib.rs                  Tauri commands
```

### DSTV `.nc1` header mapping (FNC export)

Field order after the `ST` line (validated against IPE450 properties):

| idx | field | idx | field |
|----|-------|----|-------|
| 0 | order | 7 | height / plate width |
| 1 | drawing | 8 | flange width |
| 2 | piece mark | 9 | flange thickness |
| 3 | length (mm) | 10 | web thickness |
| 4 | quantity | 11 | radius |
| 5 | profile | 12 | weight — **kg/m profiles, kg/m² plates** |
| 6 | material | … | then: parent-assembly mark, part name |

> **Note:** A full assembled-building 3D view requires an IFC export from the
> detailing software — DSTV single-part files do not store member positions. The
> per-part 3D viewer works without any extra files.
