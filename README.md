# AB-key Extension

Standalone Chromium Manifest V3 extension for hotkey-triggered click automation on complex targets where IDs and stable classes are unavailable.

## Scope (v1)

- Hotkey to action mapping.
- Action execution via content script using resilient selector strategies.
- Dynamic DOM support with retries and optional observers.
- Config storage in `chrome.storage.local` with schema versioning.
- Debug logs and structured error handling.

## Non-goals (v1)

- Full macro recording.
- Visual automation builder.
- Non-Chromium browser support.

## Success Metrics

- Action success rate: >= 95% on supported target pages.
- P50 keypress-to-click latency: <= 150 ms for immediately available elements.
- P95 keypress-to-click latency: <= 1000 ms including dynamic waits.
- Zero leaked observers after action completion.

## Capability Matrix

- Native interactive: `button`, `a`, `input[type=button|submit]`.
- Semantic interactive: `[role=button]`, `[role=menuitem]`.
- Complex wrappers: icon controls, nested labels, dynamic containers.
- Text-identified: exact/contains/regex text.
- Aria-identified: `aria-label`, `aria-labelledby`, `role`.

## Risks and Mitigations

- Dynamic re-render breaks node refs -> re-query on each attempt, observer-assisted retry.
- Overlay intercepts click -> hit-test and surface `OverlayBlocked`.
- Ambiguous target matches -> confidence score and deterministic tiebreakers.
- Service worker lifecycle resets state -> read-through config cache and lazy rehydrate.
- Permission friction -> minimal default permissions and host filtering.

## Architecture Overview

- `background/service-worker.js`: hotkey commands, tab dispatch, orchestration.
- `content/content-script.js`: DOM lookup, validation, click execution.
- `background/config-store.js`: versioned configuration, migrations, persistence.
- `shared/*`: schema, error taxonomy, logging helpers.
- `options/*`: configuration UI, import/export, diagnostics toggle.

## Quick Start

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click Load unpacked and select this folder.
4. Open Extension options page and configure mappings.
5. Use command hotkeys from `manifest.json` and verify action logs.

## Quick Guide (Opera)

1. Open `opera://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and choose `C:\Users\kuzne\AB-key`.
4. Open extension details, then open **Extension options** to review mappings.
5. Open `opera://extensions/shortcuts` and confirm hotkeys are not conflicting.
6. Test one action on an allowed site (for example `app.abacum.io`).

### Opera Troubleshooting

- If hotkeys do nothing, rebind them in `opera://extensions/shortcuts`.
- If automation fails on internal pages (`opera://*`), switch to a regular web page; content scripts are blocked on restricted pages.
- If action fails due to selector timing, enable diagnostics in options and retry.

## Packaging

Run the PowerShell script:

- `./scripts/package.ps1`

This creates a distributable zip in `dist`.

For Opera-labeled packaging:

- `./scripts/package.ps1 -Target opera`

## Releases

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

- `docs/PROJECT_STATUS.md`
- `docs/ROADMAP.md` — planned features (e.g. higher contrast model cells on Abacum)
