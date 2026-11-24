# Roadmap — AB-key

Planned features not yet shipped. See [`PROJECT_STATUS.md`](PROJECT_STATUS.md) for what is already released.

No feature is planned right now (v1.8.3 fixed the client name in the tab title; v1.8.2 lets update.ps1 download the latest release; v1.8.1 documented opening a terminal in the AB-key folder; v1.8.0 added the guide with tips at the buttons; v1.7.2 made Alt+R double-click the variable name; v1.7.1 added the "+N" dimensions popup; v1.7.0 added the pop-out window for the hotkey panel; v1.6.1
fixed Import on the Options page, added hotkey warnings on Save and removed the unused browser command).

---

## Backlog (ideas)

- Toolbar rail: verify behaviour with a panel open and on a single version page (v0.6.0 checked only with panels closed)
- Tab title still relies on the first `img[alt]` (light theme nav moved to stable selectors in v0.10.1)

- Dataset Viewer: pin columns in click order (needs moving columns; check first whether Abacum saves the order via `onColumnMoved`)
- Formula Cell Editor: replace all matches of a selection (Alt+Backspace) — **parked**, draft PR #18 (branch `feature/formula-multi-edit`). Three approaches failed on Abacum's hint parser (multi-cursor, live mirroring, edit once + copy on Enter). Reusable: chip-aware match search, match highlight, chip-mark copy. Workaround: ask Abacum's AI (Abra) to replace a variable
- Formula Cell Editor: hotkey for `selectNextOccurrence` (add the next match to the selection, like Ctrl+D in VS Code; the command is already loaded in Abacum). Several selections disable Abacum's hints — check the value first
- Shortkeys.txt import utility
- Diagnostics panel in options
