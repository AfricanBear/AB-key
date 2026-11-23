# AB-key Extension

Chrome (and Opera) Manifest V3 extension that adds hotkeys and small improvements to
[Abacum](https://app.abacum.io). It runs only on `*.abacum.io` pages. Not published in the Chrome
Web Store: install it unpacked (see [Install](#install-chrome)).

Click the extension icon on an Abacum page to open the **A+B key** panel with the hotkeys for that
page. Every feature below can be switched on or off in the extension options.

## Hotkeys

Hotkeys are handled inside the Abacum page, so they are not listed in `chrome://extensions/shortcuts`.
They also work with a Russian keyboard layout.

| Hotkey | Where | What it does |
| --- | --- | --- |
| Alt+1–5 | any page with the right toolbar | Opens the right toolbar button by position, top to bottom (the AI agent button is skipped). Models: Info, Settings, Dimensions, Activity. Datasets: Info, Scheduler, Transform, Data usage, Activity. |
| Alt+Shift+1–9 | any page | Opens the left navigation link by position after Library: Spaces, Models, Versions, Dimensions, Datasets, Integrations. |
| Alt+S | any page | Save. |
| Alt+Q | any page | Opens / closes the AI chat. |
| Alt+H | any page | Opens Abacum Academy in a new tab. |
| Alt+E | models | Edit Dimensions (needs the right Dimensions panel open). |
| Alt+A | models | "+" → Create variable on the hovered row. |
| Alt+R | models | Renames the focused variable. |
| Alt+C | models | Duplicates the focused variable (or the ticked ones). Abacum saves the copy at once. |
| Alt+X | models | Deletes the focused variable (or the ticked ones). Applied on Save. |
| Alt+G | models | Regenerates the focused variable's description with Abacum's AI. Applied on Save. |

Hovering a toolbar button or a navigation link shows its hotkey in the tooltip.

## Features

**Appearance**

- Client name in the browser tab title.
- Light theme navigation (off by default).
- Darker values in model cells.

**Models**

- Formula autocomplete opens beside the Cell Editor instead of covering the formula (always on).
- Ctrl+Backspace in formulas deletes one word instead of clearing the whole formula.
- Dimensions toggle in the model builder: dimensions shown as chips under each variable name.
- Fix for Abacum's failing Save after deleting a new, never-saved variable.

**Datasets**

- Sum, count and average of the selected cells in the Viewer.
- Pin data columns in the Viewer.
- Two-row column headers in the Viewer.
- Clicking the f chip in a transformed column's header selects its transformation step.

Details for each feature are in [Releases](#releases).

## How it works

No build step: the files in `src/` are loaded as they are.

- `src/content/` — content scripts, only on `*.abacum.io`. Each reads its options from
  `chrome.storage.local` and applies changes without a page reload.
  - `content-script.js` — hotkeys (`keydown` on the page) and the click engine: configured
    selectors first, then a scored search by text and ARIA, with retries and a `MutationObserver`.
  - `toolbar-rail.js`, `sidebar-nav.js` — find the right toolbar buttons and left navigation links
    by position.
  - `ab-key-panel-host.js` — the in-page A+B key panel.
  - `abacum-*.js` — the features above. Files ending in `-main.js` run in the page world
    (`"world": "MAIN"`) where they can reach Abacum's grid and editor objects.
- `src/background/` — service worker: install / update (config migrations) and opening the panel
  on icon click.
- `src/shared/` — config schema with defaults and migrations, error codes, logger.
- `src/options/`, `src/popup/` — options page (feature toggles, hotkeys and actions, import /
  export, diagnostics logging) and the hotkey panel.

More in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Install (Chrome)

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (toggle in the top-right corner). This is required: the **Load unpacked** button only appears in Developer mode.
3. Click **Load unpacked** and select this folder (the one that contains `manifest.json`).
4. Open an Abacum page and click the extension icon to see the hotkeys for that page.
5. To update: `git pull`, then click **Reload** on the AB-key card in `chrome://extensions` and refresh open Abacum tabs.

## Install (Opera)

1. Open `opera://extensions`.
2. Turn on **Developer mode** — required for **Load unpacked**, same as in Chrome.
3. Click **Load unpacked** and select this folder (the one that contains `manifest.json`).
4. Open an Abacum page and try a hotkey, e.g. Alt+1.

If a hotkey does nothing:

- Refresh the Abacum tab (content scripts are not added to tabs opened before the install or update).
- Check that the feature or hotkey is enabled in the extension options.
- Save the options again: Save warns about hotkeys that cannot fire (missing or disabled action, no Alt/Ctrl/Meta, the same key twice).
- Turn on **Enable diagnostics logging** in the options, retry, and check the page console at the **Verbose** level (lines start with `[AB-key]`).

## Tests

Requires Node.js 22+. No dependencies to install.

- `npm test` — runs `tests/*.test.mjs` with the built-in `node --test` runner.
- Covered: config migrations (every schema version from v1), hotkey matching (layouts, hosts,
  model-only paths), locators for every default hotkey, tooltip hints, each feature in
  `src/content/abacum-*.js`, and the options page.
- Content scripts run in `node:vm` against a small fake DOM (`tests/helpers.mjs`); live Abacum
  behaviour still needs the manual checks in [`docs/TEST_PLAN.md`](docs/TEST_PLAN.md).
- `powershell -ExecutionPolicy Bypass -File scripts/validate.ps1` — manifest checks.

CI (`.github/workflows/ci.yml`) runs `scripts/validate.ps1`, `npm test` and `scripts/package.ps1` on every push to `main` and every pull request.

## Packaging

- `./scripts/package.ps1` — zip into `dist/`.
- `./scripts/package.ps1 -Target opera` — Opera-labeled zip.

## Releases

### v1.6.1

- **Fix: Import kept the toggles, not the file's flags.** On Save the Options page wrote the toggles over the feature flags in the JSON, so flags from an imported file (or typed into the JSON) were silently replaced. The JSON is now what Save stores: a toggle edits its flag in the JSON, and importing or typing a flag moves its toggle.
- **Hotkey warnings on Save.** Options warns (and still saves) when a hotkey cannot fire: its action is missing or disabled, it has no Alt/Ctrl/Meta, or an earlier binding takes the same key on the same pages.
- Options explains the hotkey format (`alt+shift+1`, letters by physical key) and that diagnostics logs show at the console's **Verbose** level, prefixed `[AB-key]`.
- Removed the unused browser command (`run_primary_action`, never bound) with its disabled "Submit" example action, and the service worker's log in storage that nothing showed. Config migrates to schema v10: `commandBindings` and that action are dropped (the action stays if one of your hotkeys uses it); the old log is deleted on update.

### v1.6.0

- **Dimensions in the model builder** (Options → Features → Models, on by default). A third toggle next to "Show formulas" and "Show values", with the right panel's Dimensions icon. When on, every variable shows its dimensions as purple chips under its name (the first three, then "+N" with the full list on hover; "no dimensions" when it has none) and variable rows get taller; off restores Abacum's row height. One switch for all models, remembered in this browser.
  - The dimensions come from the builder grid's row data (page-world script, like the dataset columns); the extra row height goes through the grid's `getRowHeight` option, so Abacum's row density still applies.

### v1.5.0

- **Alt+G: AI description** (models). Regenerates the focused variable's description with Abacum's AI: opens the Info panel if needed, then Edit description → AI generate. Abacum replaces the description at once (including a hand-written one) and keeps the change until you press Save; reload without Save to get the old text back. Without a focused variable row nothing happens, so the model's own description is never touched. Config migrates to schema v9: Alt+G is added unless you already use it.

### v1.4.1

- **Fix: Save after deleting a new unnamed variable** (Options → Features, on by default). Abacum bug: create a variable, delete it before it was ever saved (right-click → Delete variable or Alt+X, e.g. you changed your mind before typing a name), then make any other change and click Save — every Save fails with "Variable marked for deletion does not exist or could not be found" until you reload the page and lose your edits. Abacum sends the deleted row's temporary key (like `0eqLj9i5oc-valid`) in the save request; AB-key drops such keys just before the request goes out. Real deletions (sent by variable code, `T_MD_…`) are untouched, and a save without such keys goes out unchanged. Abacum's own "variable without a name" toast on delete still shows; it is harmless.

### v1.4.0

- **Alt+X: delete variable** (models). Deletes the variable of the focused row (right-click → Delete variable); if rows are ticked, uses the bulk "Delete (n)" button instead. Abacum applies the deletion on Save (until then a reload brings the variable back) and refuses to delete a variable that other formulas use (it shows which ones). Config migrates to schema v8: Alt+X is added unless you already use it for your own action.

### v1.3.0

- **f chip selects the column's transformation** (Options → Features, on by default). In a dataset's **Viewer** tab with the **Transform** panel open, clicking the f chip in a transformed column's header now also selects the last transformation step that writes that column, as if you clicked the step itself. Abacum already shows the column in the panel header on that click, but the steps list kept its old selection. Clicks on cells (selection sum) and on the column name (sorting) are unchanged; with the panel closed nothing happens.
  - Abacum gives the f chip a pointer cursor but no hover state; now it darkens with a thin ring on hover, a bit more on press, and shows the tooltip "Show transformation step", like the pin button.

### v1.2.0

- **Ctrl+Backspace deletes one word in formulas** (Options → Features, on by default). Abacum binds Ctrl+Backspace (and Cmd+Backspace) in the formula editor to clearing the whole formula; now it deletes the word left of the cursor, like any text field. A variable chip is deleted as a whole, a selection is deleted as is. On Mac, Cmd+Backspace deletes to the start of the line. Ctrl+Delete (next word) already worked and is unchanged.
  - The CodeMirror instance is only visible in the page world, so a small `"world": "MAIN"` script handles the key; the isolated script mirrors the option into an attribute on `<html>`.

### v1.1.2

- **Version number** next to the title in the A+B key panel and on the Options page (read from `manifest.json`), so it is easy to see which build is installed.

### v1.1.1

- **Two-row column headers in dataset Viewer** (Options → Features, on by default). The header is twice as tall: the type icon, the full column name and the sort arrow on top; the pin, filter and options buttons below, always visible (Abacum shows filter and options only on hover). Off: one row as before.
  - The header height is an AG Grid option, so the page-world script sets it to twice Abacum's value and restores it when the feature is turned off.
- **Fix: the pin no longer overlaps the options button.** It was placed at a fixed 50 px from the right edge; it is now measured from Abacum's own header buttons. In one-row mode the column name leaves room for the pin.

### v1.1.0

- **Pin columns in dataset Viewer** (Options → Features, on by default). Abacum pins only the row-type/checkbox column; data columns cannot be pinned from its UI. Hover a column header in a dataset's **Viewer** tab and click the pin: the column moves next to the checkbox column and stays visible while scrolling right. You can still resize it; click the pin again to unpin.
  - Remembered per dataset in this browser (`chrome.storage.local`), together with the width of every column you resize by mouse. Both are restored when the Viewer opens again (page load, Loads → Viewer, F5). Nothing is sent to Abacum, and other users see Abacum's default layout.
  - Pinned columns keep the grid's order (AB-key never moves columns: Abacum may save the column order). Pinning is refused with a short note when pinned columns would take more than 60% of the grid.
  - Options → Features → **Reset pinned columns and widths** forgets them for all datasets.
  - Technical: a small page-world script (`"world": "MAIN"`, Chrome 111+ / Opera 97+) reaches the AG Grid api through React and calls `applyColumnState`; it has no `chrome.*` access and talks to the content script with DOM events.

### v1.0.0

- **Darker values also for read-only rows.** Variables linked from another model (the arrow icon) and the dimension rows shown on expand were still very pale: Abacum marks their cells `disabled-value-cell` and draws the value at opacity 0.4 in grey. With "Darker values in model cells" on, they now use the grid's text colour at opacity 0.85 — easy to read, still a touch lighter than editable values.

### v0.10.1

- **Fix light theme nav** (Options → Features). An Abacum release renamed the hashed classes it relied on, so the icons stayed white on the light column. It now uses only stable hooks: `data-testid="sidebar"`, the `sidebar-section-button-*` buttons and the logo `<img>`. Icons are dark, hover is a light tint, the current section is lavender.
  - Abacum marks the current section only with a hashed class, so AB-key marks it itself from the URL (`/app/modules/…` → Models) and updates it on in-app navigation and Back. Search and More are never highlighted.
  - The right drawer (AI chat, side panels) is no longer restyled by mistake.
  - Still no work at all while the feature is off.

### v0.10.0

New hotkeys (config schema v7; a key you already use for your own action is not taken over):

- **Alt+Shift+1–9: left navigation.** The N-th section link after Library — today Spaces, Models, Versions, Dimensions, Datasets, Integrations. "More" (a menu) and the bottom items are skipped. Positions are read from the page on every keypress, so new sections or links that move out of "More" get a number without an update. The A+B key panel shows them as "Go to …", and hovering a link adds the key to its tooltip ("Models · Alt+Shift+2").
- **Alt+Q: AI chat** on/off (the button at the bottom of the right rail). Works from inside the chat input too.
- **Alt+H: Abacum Academy** — opens Help & support → Abacum Academy, which Abacum opens in a new tab.
- **Alt+R: rename variable** (models). Opens the name field of the variable whose row has the focused cell — same as right-click → Rename variable. Esc cancels.
- **Alt+C: duplicate variable** (models). Duplicates the variable of the focused row (right-click → Duplicate variable); if rows are ticked, uses the bulk "Duplicate (n)" button instead. Abacum saves the copy immediately.
- Engine: positional `sidebarNav` locator, `preferredOnly` profiles (no page-wide text fallback), steps that open a right-click menu (`trigger: "contextmenu"`), and `executionPolicy.alternatives`.
- Esc for Edit Dimensions is not needed any more: Abacum closes the dialog with Esc itself (note: it discards unapplied changes without asking).

### v0.9.0

- **Formula hints beside the Cell Editor** (Models, always on). Abacum's formula autocomplete (Operators, Variables, …) used to open at the caret, often above it, covering the formula. It now opens to the right of the Cell Editor, top-aligned; to the left when the right side has no room; unchanged when neither side fits. Typing, arrow keys and clicking a hint work as before.
  - Abacum re-creates the hint list on every keystroke, so the script watches `<body>` children (no subtree) — only while a formula editor has focus. No work at all otherwise.
### v0.8.1

- **Lighter on resources.** Content scripts and host permissions are limited to `*.abacum.io` (were `<all_urls>`); the A+B key panel still opens on other sites when you click the icon.
- **Light theme nav** no longer watches every class change on the page; it observes only `<head>`, and only while the feature is on.
- **Client name in tab title** no longer runs a 1-second timer and a whole-page observer; it watches only `<title>` and retries briefly until the client logo has loaded.
- `npm test` has a 30 s per-test timeout, so a hanging test cannot block CI.

### v0.8.0

- **Selection sum in datasets** (Options → Features, on by default). In a dataset's **Viewer** tab, select two or more cells to see a tooltip with the number of numeric values, **Sum** and **Avg**, at the bottom-right of the selection.
  - Uses AG Grid's `ag-cell-range-selected*` classes; only on `/app/datasets…` (Models already have Abacum's own tooltip).
  - Numbers are parsed strictly (`13065.0`, `-1,234.5`); dates, text and empty cells are skipped.
  - AG Grid renders only rows near the viewport: if the selection may continue beyond them, the tooltip says "Visible rows only".

### v0.7.0

- **Darker values in model cells** (Options → Features, on by default). Abacum shows model values in grey (`rgb(82,82,82)`); the extension gives them the grid's own near-black text colour (`rgb(23,23,23)`). Anchored on `data-testid="value-cell"`, not on hashed classes; values or icons with their own colour keep it. Toggling applies to open tabs without reload.

### v0.6.5

- **Alt+E and Alt+A only on model pages** (`https://app.abacum.io/app/modules*`). Elsewhere they do nothing and are hidden from the A+B key panel. Alt+S and Alt+1–5 stay available on all Abacum pages.
- New optional hotkey field `paths`: list of pathname prefixes where the hotkey is active. Config migrates to version 6 (adds `paths` to Alt+E / Alt+A unless you already set your own).

### v0.6.4

- **Hotkeys in rail tooltips:** hovering a right toolbar rail button shows its hotkey next to Abacum's tooltip, e.g. "Info · Alt+1". The hotkey is read from the current config, so rebinding is reflected; buttons without a hotkey (and the AI agent button) are left as is.

### v0.6.3

- **Alt+C (Create section) removed.** Its selector targeted buttons while Abacum renders "Create section" as a menu item, so it only worked by a text fallback in an already open menu. Config migrates to version 5: the action and any hotkey bound to it are dropped; a user's own action on Alt+C is kept.

### v0.6.2

- **Alt+S:** Save inside an open dialog first, then the model builder Save button (`testid-builder-save-button`); the previous generic search remains the fallback, so Alt+S still works on other pages.
- **Alt+A:** "+" button by `testid-builder-add-button-anywhere`, then exactly **Create variable** in its menu (`testid-builder-add-dropdown-anywhere`). Before, "contains Create" also matched Create group / Create section and worked only because Create variable was first.
- New locator option `preferredSelectors`: tried in order; the first visible, enabled, uncovered element matching `textCriteria` wins, before the scored search.
- Config migrates to version 4 (only shipped defaults are replaced; edited locators are kept).

### v0.6.1

- **Fix Alt+E (Edit Dimensions):** it clicked "Show Builder Formulas" instead. The locator had a role-only fallback (`{ role: "button" }` without a label) that matched every button and outscored the real one. Role-only criteria no longer add candidates; Alt+E now uses only `[data-testid='testid-builder-bulk-dimensions']`. If the button is absent, disabled or covered by a modal, nothing is clicked.
- Config migrates to version 3 (only the shipped Alt+E selector is updated; custom selectors are kept).

### v0.6.0

- **Alt+1–5 rewritten:** click the right toolbar rail button by **position** (top to bottom) on every Abacum object type — Models, Dimensions, Datasets, Versions. Lookup uses Abacum's `data-testid="toolbar-rail-button-*"` (the old `side-action-bar` container no longer exists); the AI agent button is excluded; a geometric fallback is used if the test ids change. No page-wide fallback, so a missing button means no click.
- The A+B key panel shows the actual rail labels of the current page for Alt+1–5.
- **Fix:** content script failed to load (ES `import` in a content script) — all hotkeys were dead in the unreleased build.
- **Fix:** config was reset to defaults on every extension update/reload; now only on first install.
- **Fix:** hotkeys work with any keyboard layout (matched by physical key, e.g. Russian layout); `preventDefault` is now synchronous; config is cached instead of read on every keypress.
- **Fix:** retries no longer burn out within milliseconds on busy pages; `timeoutMs` is honoured.
- **Fix:** packaged zip now includes `assets/` (icons).
- Ctrl+Shift+Y/U browser commands are unbound by default; the generic "Submit on any site" action is disabled.
- "Experimental features" toggle removed; config migrates automatically to version 2.

### v0.5.0

- Alt+1–5 click the Abacum toolbar by index; Alt+1–4 fall back to aria labels.
- Alt+5 added for the fifth rail button.

### v0.4.1

- Options layout: Save in header; Reload, Export, Import in Configuration toolbar.

### v0.4.0

- **Light theme nav** for `*.abacum.io`: optional drawer and nav styling from options.
- Preview images in options show default vs light nav icon appearance.

### v0.3.1

- Popup hotkey labels updated: Edit Dimensions, Context: Add + Create variable.

### v0.3.0

- Options page redesigned with dark glassmorphism styling and extension logo in the header.

### v0.2.2

- Toolbar popup from the extension icon shows Abacum hotkeys (short label + key binding).
- Dark glass-style popup panel.

### v0.2.1

- Abacum tab title can be turned on or off in the **A+B key** options page (`abacumTabTitleEnabled`).
- Options window title renamed from “MV3 Click Automation” to **A+B key**.
- Tab title script reacts to saved settings; refresh open Abacum tabs if a change does not apply immediately.

### v0.2.0

- On `app.abacum.io`, the browser tab title is prefixed with the client name from the first non-empty `img[alt]`.
- DOM mutation observer and periodic refresh keep the prefix when React updates the page title.

Full release notes (including v0.1.0 Opera packaging): [`docs/RELEASE_NOTES_OPERA.md`](docs/RELEASE_NOTES_OPERA.md).

## Project Status

For implementation history and continuation notes, see:

- [`docs/PROJECT_STATUS.md`](docs/PROJECT_STATUS.md)
- `docs/ROADMAP.md` — planned features
