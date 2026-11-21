# Roadmap — AB-key

Planned features not yet shipped. See [`PROJECT_STATUS.md`](PROJECT_STATUS.md) for what is already released.

No feature is planned right now (the f chip selecting a column's transformation step shipped in v1.3.0).

---

## Backlog (ideas)

- Toolbar rail: verify behaviour with a panel open and on a single version page (v0.6.0 checked only with panels closed)
- Tab title still relies on the first `img[alt]` (light theme nav moved to stable selectors in v0.10.1)

- Dataset Viewer: pin columns in click order (needs moving columns; check first whether Abacum saves the order via `onColumnMoved`)
- Formula Cell Editor: replace all matches of a selection (Alt+Backspace) — **parked**, draft PR #18 (branch `feature/formula-multi-edit`). Three approaches failed on Abacum's hint parser (multi-cursor, live mirroring, edit once + copy on Enter). Reusable: chip-aware match search, match highlight, chip-mark copy. Workaround: ask Abacum's AI (Abra) to replace a variable
- Formula Cell Editor: hotkey for `selectNextOccurrence` (add the next match to the selection, like Ctrl+D in VS Code; the command is already loaded in Abacum). Several selections disable Abacum's hints — check the value first
- Model builder: hotkey to delete the focused variable (right-click → Delete variable, or the bulk toolbar for ticked rows, like Alt+C duplicate); Delete waits for Save, so decide whether to confirm first
- Model builder: hotkey to update a variable's AI description (find first where the action lives in the DOM)
- Model builder: toggle the dimensions list view on a model, like the Library view, with a button like the formula/values toggle (check first what the Library view shows and whether a model page has the same component)
- Shortkeys.txt import utility
- Diagnostics panel in options
