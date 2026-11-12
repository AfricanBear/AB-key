# Project Status - AB-key

Last updated: 2026-11-12

## Current Snapshot

- Repository: `https://github.com/AfricanBear/AB-key`
- Default branch: `main`
- Latest release tag: `v0.5.0`
- Packaging outputs:
  - `dist/AB-key.zip`
  - `dist/AB-key-opera.zip`

## What Has Been Completed

### Core Extension

- MV3 extension scaffolded and functional:
  - Background service worker orchestration
  - Content script automation engine
  - Options page for config management
- Name updated to `AB-key`.
- Custom icon integrated from provided PNG (`assets/icons/ab-key.png`).

### Selector + Automation Engine

- Multi-strategy element matching implemented:
  - CSS selector candidates
  - Text criteria matching (`contains`, `exact`, `regex`)
  - Aria criteria matching
  - Ranked fallback scoring
- Dynamic content support implemented:
  - Retry loop with timeout policy
  - Optional `MutationObserver` wait path
- Interaction safety checks added:
  - Visibility/disabled checks
  - Hit-test/overlay detection

### Shortkeys Rule Migration

- Parsed and migrated rules from `Shortkeys.txt`.
- Added host-scoped hotkey mappings for `app.abacum.io`.
- Added support for:
  - Pre-actions (e.g. blur active element)
  - Multi-step action execution flows

### Opera Adaptation

- Opera compatibility audit documented.
- Opera quick guide and troubleshooting added to README.
- Opera packaging target added (`scripts/package.ps1 -Target opera`).
- Release notes and smoke-test checklists added for Opera.

### Git + GitHub

- Git repository initialized in `C:\Users\kuzne\AB-key`.
- Initial commit created and pushed to GitHub.
- Remote configured to:
  - `origin https://github.com/AfricanBear/AB-key.git`
- Release tags `v0.1.0` through `v0.5.0` created and pushed.

### Abacum tab title (v0.2.0 / v0.2.1)

- Content script `src/content/abacum-tab-title.js` for `app.abacum.io`.
- v0.2.1: options toggle `abacumTabTitleEnabled`; options UI branded **A+B key**.

### Toolbar popup (v0.2.2)

- `src/popup/` hotkey reference panel via `default_popup`.

### Options UI (v0.3.0)

- Glassmorphism options page; extension logo in header.

### Light theme nav (v0.4.0)

- `src/content/abacum-light-nav.js` on `*.abacum.io`; options toggle and preview images.

### Index toolbar hotkeys (v0.5.0)

- `toolbarIndex` locator for Alt+1–5 on Abacum `[data-testid="side-action-bar"]` rail. Superseded in v0.6.0 (see below).

### Positional toolbar rail (v0.6.0, unreleased)

- Abacum replaced `side-action-bar` with a new layout; each rail button now has `data-testid="toolbar-rail-button-<object>-<panel>"`.
- Alt+1–5 = N-th visible rail button top to bottom (AI agent excluded) — works on Models, Dimensions, Datasets, Versions.
- Logic: `src/content/toolbar-rail.js` (classic script, `globalThis.AbKeyToolbarRail`); locator `{ "toolbarRail": { "position": N } }`.
- "Experimental features" toggle and `src/experimental/` removed; config schema v2 migrates v1 rail actions to `action.rail1..5`.
- Verified live (2026-11-12, read-only DOM): Models = Info, Settings, Dimensions, Activity; Dimensions = Info, Activity; Datasets = Info, Scheduler, Transform, Data usage, Activity; Versions list = Activity.

## Important Paths

- Manifest: `manifest.json`
- Background worker: `src/background/service-worker.js`
- Content scripts: `src/content/toolbar-rail.js`, `src/content/content-script.js`, `src/content/ab-key-panel-host.js`, `src/content/abacum-tab-title.js`, `src/content/abacum-light-nav.js`
- Config schema: `src/shared/config-schema.js`
- Options UI: `src/options/options.html`, `src/options/options.js`
- Popup UI: `src/popup/popup.html`, `src/popup/popup.js`, `src/popup/popup.css`
- Packaging scripts: `scripts/package.ps1`, `scripts/validate.ps1`
- Core docs:
  - `README.md`
  - `docs/ARCHITECTURE.md`
  - `docs/OPERA_COMPATIBILITY.md`
  - `docs/OPERA_SMOKE_TEST.md`
  - `docs/RELEASE_NOTES_OPERA.md`
  - `docs/ROADMAP.md`

## Roadmap

Planned work is tracked in [`docs/ROADMAP.md`](ROADMAP.md).

**Planned Abacum UI features** (see roadmap for detail):

- **Higher contrast model cells** — opacity on `.css-kdwx3d` / `.css-fjadjf` (options toggle)
- **Dataset range selection sum** — Sum/Avg tooltip on Dataset via `ag-cell-range-selected*` (always on)
- **Formula autocomplete locked to the side** — reposition `ul.CodeMirror-hints` beside Cell Editor (always on)

## Recommended Next Commit Targets

1. Implement **Higher contrast model cells** (see roadmap).
2. Add automated tests for selector engine and config migration logic.
3. Add CI workflow (manifest validation + packaging checks on push/PR).
4. Add import utility to ingest future `Shortkeys.txt` exports automatically.
5. Improve diagnostics UI (view structured logs directly in options page).
6. Add action validation helpers to catch malformed mapping definitions earlier.

## Open Risks / Follow-ups

- `host_permissions` currently use `<all_urls>`; evaluate narrowing scope for production.
- Cross-origin iframes and browser-restricted pages remain non-automatable by design.
- Hotkey collisions can occur across OS/browser profiles; document a rebinding policy.

## Continuation Checklist (Use Before Next Work Session)

- Pull latest from `main`.
- Rebuild package:
  - `powershell -ExecutionPolicy Bypass -File "scripts/validate.ps1"`
  - `powershell -ExecutionPolicy Bypass -File "scripts/package.ps1" -Target opera`
- Verify extension loads in Opera and one hotkey action works.
- Create next commit from one focused improvement area above.
