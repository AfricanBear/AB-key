# Project Status - AB-key

Last updated: 2026-05-19

## Current Snapshot

- Repository: `https://github.com/AfricanBear/AB-key`
- Default branch: `main`
- Latest release tag: `v0.2.2`
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
- Release tags `v0.1.0` through `v0.2.2` created and pushed.

### Abacum tab title (v0.2.0 / v0.2.1)

- Content script `src/content/abacum-tab-title.js` for `app.abacum.io`.
- v0.2.1: options toggle `abacumTabTitleEnabled`; options UI branded **A+B key**.

### Toolbar popup (v0.2.2)

- `src/popup/` hotkey reference panel via `default_popup`.

## Important Paths

- Manifest: `manifest.json`
- Background worker: `src/background/service-worker.js`
- Content scripts: `src/content/content-script.js`, `src/content/abacum-tab-title.js`
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

## Recommended Next Commit Targets

1. Add automated tests for selector engine and config migration logic.
2. Add CI workflow (manifest validation + packaging checks on push/PR).
3. Add import utility to ingest future `Shortkeys.txt` exports automatically.
4. Improve diagnostics UI (view structured logs directly in options page).
5. Add action validation helpers to catch malformed mapping definitions earlier.

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
