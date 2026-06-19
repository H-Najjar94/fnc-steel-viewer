# 06 - DECISIONS & PREFERENCES

> Two things that are invisible in the project itself and lost when a session ends:
> (1) decisions we made and WHY, (2) how you want me to work.
> Append here whenever a choice is made or you correct me. Never silently drop one.

---

## Preferences - how to work with me
> Every time you correct me or state a preference, I record it here as a rule.

- Keep responses concise and factual; report concrete paths and counts.
- Treat all engineering files (`.dwg/.nc1/.dxf/.pdf/.xlsb`) as real fabrication
  data - never delete/rename/overwrite without explicit confirmation.
- (add more as they come up)

---

## Decisions log
> Format: date - decision - why - alternatives rejected.

### 2026-06-19 - Free DWG viewing for Madar (no proprietary SDK)
- **Decision:** For Madar, keep the free no-proprietary path: if an IFC exists, use
  that for the full 3D view; otherwise fall back to STL export for 3D. For 2D,
  keep LibreDWG (free, GPL) DWG->DXF for the drawing tab. User chose "do both".
- **Why:** keeps it free + offline; uses tools already present; avoids the ODA
  commercial SDK and Autodesk cloud (which would upload models off-machine).
- **Rejected:** Autodesk APS/Forge cloud viewer (uploads to Autodesk servers, needs
  internet/account); a pure-JS DWG renderer (none exist reliably, esp. 3D).
- **Note:** STL gives a single monochrome mesh - no per-part picking/coverage. Full
  features (like ELNAGAR) still need a one-time IFC export from Advance Steel/Tekla
  when IFC is not already present.

### 2026-06-18 - FNC Steel Viewer app: stack & key choices
- **Decision:** Build the file-viewer app with React + TS + Vite + Tauri v2 + Rust
  (stack chosen by the user). Scaffold in a SIBLING folder `taff/fnc-viewer`, not
  inside the data folder. 3D = "both": per-part reconstruction from DSTV always +
  full-building IFC viewer (web-ifc) when an IFC is present. Primary user = workshop.
- **Why:** Keeps fabrication data clean/separate; per-part 3D works with no extra
  files (user said they may not get an IFC); workshop needs fast mark->files lookup.
- **Rejected:** Rendering `.dwg` directly (no open web renderer) -> use the 1:1 PDF
  twins instead. Reconstructing the assembled building from DSTV singles (no position
  data in single-part files).
- **Gotcha recorded:** DSTV weight field is kg/m for profiles but kg/m^2 for plates.

### 2026-06-18 - Use a 6-file session-context system
- **Decision:** Maintain `01_INFO`, `02_UNDERSTANDING`, `03_UPDATES_HISTORY`,
  `04_INSTRUCTIONS`, `05_CURRENT_STATE`, `06_DECISIONS_AND_PREFERENCES`, with a
  `CLAUDE.md` that auto-loads them at session start.
- **Why:** Persist context across sessions so no understanding or info is lost and
  no time is wasted re-deriving it.
- **Rejected:** Single monolithic notes file (harder to keep sections current);
  relying on memory only (doesn't carry structure/history reliably).
