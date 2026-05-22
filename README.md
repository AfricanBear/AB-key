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
