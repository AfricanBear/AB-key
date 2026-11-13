# AB-key — notes for Claude

Chrome (and Opera) MV3 extension that adds hotkeys and small improvements to Abacum
(`app.abacum.io`). No build step: files in `src/` are loaded as-is. The owner speaks Russian —
answer in Russian; code, commits, PRs and repo docs are in English.

## Commands

- `npm test` — all tests (`node --test`, Node 22+, no dependencies). Run before every commit.
- `powershell -ExecutionPolicy Bypass -File scripts/validate.ps1` — manifest checks (referenced files exist, no ES modules in content scripts).
- `powershell -ExecutionPolicy Bypass -File scripts/package.ps1 [-Target opera]` — zip into `dist/` (git-ignored).
- CI (`.github/workflows/ci.yml`) runs validate + tests + package on every PR and push to `main` (~30 s).

## Layout

- `src/content/` — classic content scripts, only on `*.abacum.io` (Chrome ignores `"type": "module"`
  for content scripts; never use `import` there). Each reads `mv3ClickAutomation.config` from
  `chrome.storage.local` and reacts to `storage.onChanged`.
  - `content-script.js` — hotkeys + click engine (`preferredSelectors` → scored search).
  - `toolbar-rail.js` — right toolbar buttons by position (`globalThis.AbKeyToolbarRail`).
  - `ab-key-panel-host.js` — in-page A+B key panel (iframe of `src/popup/popup.html`).
  - `abacum-*.js` — tab title, light nav, darker model values, dataset selection sum.
- `src/shared/config-schema.js` — defaults + migrations (schema v6). Changing defaults of a shipped
  config means a new migration that replaces only shipped values and keeps user edits, plus a test.
- `src/background/` — service worker (install/update, panel injection on icon click).
- `src/options/`, `src/popup/` — options page and hotkey panel (ES modules, fine there).
- `tests/` — `helpers.mjs` runs content scripts in `node:vm` with a fake DOM.

## Abacum DOM facts (verified Nov 2026)

Prefer `data-testid` and AG Grid / MUI base classes; hashed `css-xxxx` classes change between
Abacum releases.

- Right toolbar: `button[data-testid^="toolbar-rail-button-"]`, top to bottom; skip `ai-agent`.
  Models: Info, Settings, Dimensions, Activity. Datasets: Info, Scheduler, Transform, Data usage,
  Activity. Dimensions: Info, Activity. Versions list: Activity.
- Tooltips: MUI `.MuiTooltip-popper[role=tooltip] > .MuiTooltip-tooltip`, no aria link to the button.
- Model builder: `testid-builder-save-button`, `testid-builder-bulk-dimensions` (Alt+E),
  `testid-builder-add-button-anywhere` (only visible on row hover) and its menu
  `testid-builder-add-dropdown-anywhere` (Create variable / group / section).
  Value cells: `[data-testid="value-cell"]`. Edit-dimensions modal: `module-builder-dbv-modal`.
- Datasets: data is in the **Viewer** tab; the URL stays `/app/datasets/<id>/manager`
  (`/viewer` is a 404). AG Grid range selection: `ag-cell-range-selected*`.
- Model pages: `/app/modules/...`. `<title>` lives in `<head>` and changes on in-app navigation.

## Working agreements

- For anything beyond a small fix: inspect, then present a short plan and wait for approval.
- Before changing a selector, read the live DOM (read-only) in the owner's Chrome; don't guess.
  Live checks: inject a copy of the script into the page (stub `chrome.storage`), then reload.
  For AG Grid selection use click + Shift+click (fast drags don't register).
- One branch per change (`feature/…`, `fix/…`, `perf/…`, `chore/…`), PR into `main`, never commit
  feature work straight to `main`. Doc-only tweaks may go to `main` when the owner says so.
- Release: bump `manifest.json` version, add a README "Releases" entry, update `docs/TEST_PLAN.md`
  and `docs/ROADMAP.md`; after merge, pull `main` and add an annotated tag
  `vX.Y.Z — <summary>` only when asked.
- Add or update a test with every behaviour change; check that it fails on the old code.
- Don't put client names or other client data into commits, PRs, docs or published pages.
