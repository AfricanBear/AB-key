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
  - `sidebar-nav.js` — left navigation links after Library by position (`globalThis.AbKeySidebarNav`).
  - `ab-key-panel-host.js` — in-page A+B key panel (iframe of `src/popup/popup.html`).
  - `abacum-*.js` — tab title, light nav, darker model values, dataset selection sum, formula hints,
    dataset pinned columns (`abacum-dataset-columns.js` + `abacum-dataset-columns-main.js`),
    formula word delete (`abacum-formula-keys.js` + `abacum-formula-keys-main.js`), f chip → transformation
    step (`abacum-dataset-transform-link.js`), model dimensions chips
    (`abacum-model-dimensions.js` + `abacum-model-dimensions-main.js`), model Save fix
    (`abacum-model-save-fix.js` + `abacum-model-save-fix-main.js`). `*-main.js` run
    in `"world": "MAIN"`: no `chrome.*` there, talk via `CustomEvent` with JSON detail or an
    attribute on `<html>`.
- `src/shared/config-schema.js` — defaults + migrations (schema v11). Changing defaults of a shipped
  config means a new migration that replaces only shipped values and keeps user edits, plus a test.
- `src/background/` — service worker (install/update, panel injection on icon click).
- `src/options/`, `src/popup/` — options page and hotkey panel (ES modules, fine there).
- `tests/` — `helpers.mjs` runs content scripts in `node:vm` with a fake DOM.

## Abacum DOM facts (verified Nov 2026)

Prefer `data-testid` and AG Grid / MUI base classes; hashed `css-xxxx` classes change between
Abacum releases.

- Right toolbar: `button[data-testid^="toolbar-rail-button-"]`, top to bottom; skip `ai-agent`
  (models: `toolbar-rail-button-module-info|settings|dimensions|activity`).
  Models: Info, Settings, Dimensions, Activity. Datasets: Info, Scheduler, Transform, Data usage,
  Activity. Dimensions: Info, Activity. Versions list: Activity.
- Tooltips: MUI `.MuiTooltip-popper[role=tooltip] > .MuiTooltip-tooltip`, no aria link to the button.
- Model builder: `testid-builder-save-button`, `testid-builder-bulk-dimensions` (Alt+E),
  `testid-builder-add-button-anywhere` (only visible on row hover) and its menu
  `testid-builder-add-dropdown-anywhere` (Create variable / group / section).
  Value cells: `[data-testid="value-cell"]`; read-only ones (linked variables with
  `button-link-model`, dimension rows on expand) add `disabled-value-cell`, and their
  `.cell-value` child has opacity 0.4 and its own grey. Edit-dimensions modal: `module-builder-dbv-modal`.
- Formula Cell Editor: `.ag-popup-editor[role=dialog]` (no `aria-label`) with
  `[data-testid="testid-codemirror"]` (CodeMirror 5). Hints `ul.CodeMirror-hints#cm-complete-N`
  live in `<body>` and are **re-created on every keystroke** (inline `left/top`); CodeMirror
  rewrites that style on editor scroll. The instance is `.CodeMirror`'s `CodeMirror` property
  (page world only); Abacum's `extraKeys` map Ctrl/Cmd-Backspace to `setValue("")`, Esc to
  cancel; variable chips are atomic marks (`replacedWith` widget) over text like `v{{Name}}`.
  Esc first closes open hints, a second Esc cancels. Multiple selections work (`setSelections`), but
  show-hint refuses several selections. Chips are marked only when the editor opens and when a
  hint is picked (`origin "complete"`, the mark comes after the change) — text set by code stays
  raw `v{{..}}`, and `setValue` drops every chip. An operator hint inserts ` -` and steps over the
  next space. Enter with no hint list open = Apply, Esc = Cancel: test with the Cancel button and
  check Save. Hints depend on Abacum's own parser state (edits in several places, or a place
  opened by deleting text, confuse it) — see the parked replace-all PR #18 before trying again.
  No match-highlight addon; `CodeMirror.commands.selectNextOccurrence` exists.
- Left nav: `button[data-testid="sidebar-section-button-<Name>"]` inside `a[href="/app/..."]`.
  After Library: Spaces, Models, Versions, Dimensions, Datasets, Integrations, More (More is a
  menu wrapped in a link to the current page; so is Search). The current section has no stable
  marker (only a hashed class + `rgba(255,255,255,.2)` background); the light nav marks it
  itself (`data-ab-key-nav-active`). Bottom: WhatsNew, HelpAndSupport (menu
  `help-and-support-contextual-menu`, "Abacum Academy" calls `window.open`), Settings.
- AI chat: `toolbar-rail-button-ai-agent` toggles `[data-testid="ai-chat"]`.
- Variable row menu: right-click (a synthetic `contextmenu` works) on the name cell →
  `[data-testid="mb-contextual-menu"] [role=menuitem]` (Rename / Duplicate / Delete variable …).
  Focused row: `.ag-row.variable-row.ag-row-focus` (in every column container). Ticked rows show
  `model-builder-bulk-actions-toolbar` (buttons by `aria-label`, e.g. `duplicate-variables`).
  **Duplicate is saved immediately; Delete waits for Save.** Abacum refuses to delete a variable
  other formulas use (red toast naming them, no dialog); bulk Delete is `aria-label="delete-variables"`.
- Model Save: `PUT /modelling/<model id>` (XHR) with the whole model plus `variables_created`,
  `variables_edited`, `variables_deleted`, `variables_duplicated`. Saved variables are listed by
  code (`T_MD_XXXX`); a new row has a temporary key like `0eqLj9i5oc-valid` until saved. Abacum bug:
  deleting a never-saved row (menu or Alt+X) puts that key into `variables_deleted` and the backend
  rejects every save (400 `CANNOT_DELETE_VARIABLE`) — fixed by `abacum-model-save-fix-main.js`.
  Creating or deleting rows sends nothing until Save. After any save test, reload and check: a 200
  with an empty `updated_fields` does not prove a deletion happened.
- Builder view toggles: `button[aria-label="Show Builder Formulas|Values"]` (MUI IconButton,
  `aria-pressed`) in one flex box with the timescale and `row-density-select`. Grid option
  `rowHeight` is 32 (regular), no `getRowHeight`. Name cell: `[data-testid="drag-and-drop-cell"]`
  fills the cell (flex row, name centred); the cell is `overflow:hidden`.
- Variable Info (focused row + Info drawer, `data-testid="toolbar-drawer"`): Description with
  `Edit description` → textarea, `ai-generate-description-button`, Cancel / Save. AI generate
  replaces the text itself and closes the editor at once (no review step); the change waits for
  the model Save, a reload without Save restores it. Grid row data
  (page-world api) has `description`, `description_ai_generated`, `dimensions` (names).
- Edit Dimensions (`testid-builder-bulk-dimensions`) exists only with the right **Dimensions**
  panel open. Its dialog closes with Esc natively (unapplied changes are lost);
  Cancel `testid-dbv-modal-cancel`, Apply `testid-dbv-modal-accept` (disabled while unchanged).
- Datasets: data is in the **Viewer** tab; the URL stays `/app/datasets/<id>/manager`
  (`/viewer` is a 404). AG Grid range selection: `ag-cell-range-selected*`.
- Dataset Viewer grid: `.ag-root-wrapper` with header `col-id="_abacum_type"` (pinned left, the
  Loads tab grid has none) and `_abacum_status` (pinned right); server-side row model. Data columns
  have `lockPinned: true`, the context menu is off and the column menu has only the filter tab.
  The grid api is reachable only in the page world via the React fiber of `.ag-root-wrapper`
  (hook state ~4 levels up); `applyColumnState` pins despite `lockPinned`. Abacum handles
  `onColumnMoved` (may persist order) but not pinned/resized. Loads → Viewer re-creates the grid.
  Header: `headerHeight` grid option 32 (set by Abacum, so only `setGridOption` changes it);
  `[data-testid="custom-column-header"]` is a `row-reverse` flex of two `.ag-header-cell-menu-button`
  (options, filter; opacity 0 until `.ag-header-active`) and `.ag-header-cell-label`.
- Dataset Transform panel (`toolbar-rail-button-dataset-transform`; URL keeps `?panel=info`): steps are
  `ul[data-rfd-droppable-id="transformations-dnd-list"] [data-rfd-draggable-id="<index>-<column>"]`
  (MUI `ListItemButton`, no testid); the selected one has `Mui-selected` and a check icon, the last
  step by default. `.click()` on a step selects it, highlights and scrolls to its column. Step
  menu (`aria-label="display more actions"`): Edit opens a modal dialog (Cancel / Continue), Delete.
  Add menu (`add-transformation-menu`): Apply formula, AI data cleaner, AI classifier. Transformed
  columns have an f chip in the header (`[aria-label="status-icon-container"]
  [data-testid="testid-abax-chip"]` with `svg[data-testid="function-icon"]`); clicking it shows
  the column in the panel header but does not move the list selection. Their headers are not
  sortable; source columns are.
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
