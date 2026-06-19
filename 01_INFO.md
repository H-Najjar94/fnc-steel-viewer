# 01 — PROJECT INFO

> Quick-reference facts about this project. Read first.

## Identity
- **Project:** ELNAGAR-IFF
- **Revision:** REV00
- **Type:** Structural steel fabrication / shop-detailing deliverable
- **Root:** `c:\Users\user\Documents\taff\ELNAGAR-IFF-REV00\ELNAGAR-IFF-REV00`
- **Owner contact:** hammzanajjar@gmail.com

## What this is
A steel detailing output package: drawings + CNC machine files + bill-of-material
reports for fabricating a steel structure (columns, rafters, mezzanine beams,
bracing, cold-formed members, plates). This is **engineering/manufacturing data,
not a software codebase.** There is no build, no tests, no git repo.

## Top-level layout
```
ELNAGAR-IFF-REV00/
├── ASSEMBLY/        Assembly (GA-level) drawings
│   ├── CAD/         1090 × .dwg
│   └── PDF/         1090 × .pdf   (1:1 mirror of CAD)
├── SINGLE/          Single-part drawings
│   ├── CAD/PLATES/  by thickness (PL2 … PL30)
│   └── PDF/PLATES/  1276 × .pdf
│       PDF/PROFILES/ profile single-part PDFs
├── CNC FILES/       Machine-ready manufacturing data
│   ├── PLATES/
│   │   ├── DSTV_Plates/  1276 × .nc1   (DSTV/NC for nesting & cutting)
│   │   └── NC_dxf/       1276 × .dxf   (laser/plasma profiles)
│   └── PROFILES/
│       ├── DSTV_Profiles/ .nc1  (beam/profile CNC — saw, drill, cope)
│       └── NC_dxf/         .dxf
└── REPORTS/
    ├── SS-BOM-ASSEMBLY.xlsx
    ├── SSS_MTO-REV00.xlsb        (Material Take-Off)
    └── SSS_Single BOM-REV00.xlsb
```

## Key numbers (as of REV00 baseline)
- Total files: **~6,026**
- Assembly drawings: **1,090** (DWG) + **1,090** (PDF)
- Plate parts (CNC): **1,276** each of `.nc1`, `.dxf`, single PDF
- Plate thicknesses present: PL2, PL4, PL5, PL6, PL8, PL10, PL12, PL14, PL15, PL16, PL20, PL25, PL30 (mm)
- Reports: 3 spreadsheets

## Part-mark prefixes (ASSEMBLY)
| Prefix | Meaning            | Prefix | Meaning           |
|--------|--------------------|--------|-------------------|
| C      | Column             | RF     | Rafter            |
| BU     | Mezzanine beam     | FB     | Flange brace      |
| BR     | Bracing angle      | RB     | Rod bracing       |
| SR     | Sag rod            | SA     | Sag angle         |
| G      | Gusset plate       | CL     | Clip              |
| P / PL | Plate              | ST     | (bracing/strut)   |
| A      | Flange brace (A-)  | CRB / CB | Bracing variants |

(Plate single-parts are filed under CNC as `IF###` marks, e.g. `IF106`.)

## File-format glossary
- **.dwg** — AutoCAD drawing (open in AutoCAD/equivalent; not text-readable here)
- **.nc1** — DSTV NC file, the standard CNC exchange format for steel
- **.dxf** — 2D vector geometry for laser/plasma/router cutting
- **.xlsb / .xlsx** — Excel BOM / Material Take-Off (binary `.xlsb` needs Excel)
