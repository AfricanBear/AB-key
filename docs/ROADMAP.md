# Roadmap — AB-key

Planned features not yet shipped. See [`PROJECT_STATUS.md`](PROJECT_STATUS.md) for what is already released.

No feature is planned right now (Alt+X deletes the variable shipped in v1.4.0).

---

## Backlog (ideas)

- Toolbar rail: verify behaviour with a panel open and on a single version page (v0.6.0 checked only with panels closed)
- Tab title still relies on the first `img[alt]` (light theme nav moved to stable selectors in v0.10.1)

- Dataset Viewer: pin columns in click order (needs moving columns; check first whether Abacum saves the order via `onColumnMoved`)
- Dataset Viewer: click the f chip in a column header (`[aria-label="status-icon-container"] [data-testid="testid-abax-chip"]` with `svg[data-testid="function-icon"]`, transformed columns only) with the Transform panel open → also select the last step for that column in the list (`[data-rfd-draggable-id="<index>-<column>"]`, `.click()` selects it). Natively the chip only shows the column in the panel header and highlights it; the list selection (`Mui-selected`) does not move. Not cells or the header label: cell clicks belong to the range sum, label clicks sort source columns. Check first whether clicking a step drops an unsaved step edit
- Formula Cell Editor: replace all matches of a selection (Alt+Backspace) — **parked**, draft PR #18 (branch `feature/formula-multi-edit`). Three approaches failed on Abacum's hint parser (multi-cursor, live mirroring, edit once + copy on Enter). Reusable: chip-aware match search, match highlight, chip-mark copy. Workaround: ask Abacum's AI (Abra) to replace a variable
- Formula Cell Editor: hotkey for `selectNextOccurrence` (add the next match to the selection, like Ctrl+D in VS Code; the command is already loaded in Abacum). Several selections disable Abacum's hints — check the value first
- Model builder: hotkey to update a variable's AI description. Path: focused row → Info drawer (`toolbar-rail-button-module-info`, Alt+1) → `Edit description` → `[data-testid="ai-generate-description-button"]` (tooltip: delete the current description first) → Save / Cancel. Stop before Save so a hand-written description is not lost unseen
- Model builder: show each variable's dimensions, like the "Active Dimensions" column of Library → Variables, behind a button next to "Show Builder Formulas" / "Show Builder Values" (no native toggle). Row data of the builder grid has `dimensions` (array of names); safer to draw chips in the name cell than to add a column to Abacum's grid
- Shortkeys.txt import utility
- Diagnostics panel in options
