# 04 — INSTRUCTIONS

> How I (Claude) should work in this project. Read every session. Follow these.

## The 7 rules that make these files worth keeping
> A stale context file is WORSE than none — I'd act on wrong info confidently.
> These rules exist to prevent rot. They are not optional.

1. **Read at start, always.** Begin every session by reading all 6 context files.
2. **Trust, but verify the cheap things.** Files are my memory, but data may have
   changed. Before any task depending on exact counts/names, spot-check the real
   folders. Never quote a saved number as current fact without checking if it matters.
3. **Update at the end of every session** — not "when I remember." (See close-out below.)
4. **Capture corrections the moment they happen.** Every correction → a rule in
   `06_DECISIONS_AND_PREFERENCES.md`. Highest-value habit; it stops repeat mistakes.
5. **One fact, one place.** Never copy the same info into multiple files. Duplicates
   drift out of sync and become untrustworthy.
6. **Keep them lean — map, not territory.** Facts/rules/decisions only, never dumps
   of file lists. The folders are the source of truth; these files are the index.
7. **Stale info is deleted or fixed, never left.** A wrong line is a trap. Correct it
   immediately. In `05_CURRENT_STATE`, finished items move to history and are removed.

> Meta-rule: save only what is (a) true for a while, (b) costly to re-derive,
> (c) not obvious from the files themselves — and keep it current or kill it.

## At the start of every session
1. Read all 6 files in order: `01_INFO` → `02_UNDERSTANDING` → `03_UPDATES_HISTORY`
   → `04_INSTRUCTIONS` → `05_CURRENT_STATE` → `06_DECISIONS_AND_PREFERENCES`.
2. Check `05_CURRENT_STATE.md` first for what we're mid-way through.
3. Apply rule #2 (trust but verify) before acting on saved counts/names.

## End-of-session close-out (3 questions, every time)
1. **Did I DO something?** → log it at the TOP of `03_UPDATES_HISTORY.md`
   (newest first, append-only — never edit old entries).
2. **Did I LEARN or get CORRECTED?** → update `02_UNDERSTANDING.md` (understanding)
   and/or `06_DECISIONS_AND_PREFERENCES.md` (rules & decisions + the WHY).
3. **Did WHAT'S-NEXT change?** → update `05_CURRENT_STATE.md`; move done items out.
   Also update `01_INFO.md` if baseline facts/counts changed.

## How to treat the data (safety)
- This is real fabrication data. **Never delete, rename, move, or overwrite** any
  `.dwg`, `.nc1`, `.dxf`, `.pdf`, or report file without explicit confirmation.
- Prefer read-only inventory/consistency operations. If a task needs changes,
  state the plan and confirm before touching engineering files.
- I generally cannot read `.dwg`/`.nc1`/`.xlsb` as text — work from filenames,
  structure, counts, and consistency, and say so rather than guessing geometry.

## Useful checks I can run on request
- **Mirror check (assembly):** every `ASSEMBLY/CAD/*.dwg` has a matching
  `ASSEMBLY/PDF/*.pdf` (and vice-versa).
- **Plate triplet check:** each plate mark `IF###` exists as `.nc1`, `.dxf`, and a
  single PDF, under the same `PLxx` thickness.
- **Count reconciliation:** file counts vs. expected (1090 / 1276 / etc.).
- **Missing-number scan:** gaps in mark sequences (e.g. columns C1…Cn).
- **Cross-ref to BOM/MTO** once spreadsheet contents are available.

## Style
- Be concise and factual. Report counts and concrete file paths.
- Flag anything inconsistent (missing pairs, mismatched thickness, orphan files).
- Convert relative dates to absolute (YYYY-MM-DD) in the log. Today is set per
  session context.

## Maintenance rule
Keep these files lightweight: facts and structure, not dumps of full file lists.
The folders themselves are the source of truth; these files are the map.
