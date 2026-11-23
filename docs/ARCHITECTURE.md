# Architecture

AB-key has no build step: the files in `src/` are loaded as they are. Everything runs on
`*.abacum.io` only.

## Modules

### Content scripts (`src/content/`)

Classic scripts (no `import`; Chrome ignores `"type": "module"` for content scripts). Each reads
`mv3ClickAutomation.config` from `chrome.storage.local` and reacts to `storage.onChanged`, so option
changes apply to open tabs without a reload.

- `content-script.js` — hotkeys and the click engine (see below), plus the hotkey hints added to
  the toolbar and navigation tooltips.
- `toolbar-rail.js` — right toolbar buttons by position (`globalThis.AbKeyToolbarRail`).
- `sidebar-nav.js` — left navigation links after Library by position (`globalThis.AbKeySidebarNav`).
- `ab-key-panel-host.js` / `.css` — the in-page A+B key panel (an iframe of `src/popup/popup.html`).
- `abacum-*.js` — one file per feature (tab title, light nav, darker values, dataset selection sum,
  formula hints, dataset columns, formula keys, f chip → transformation step, model dimensions,
  model Save fix).
- `abacum-*-main.js` — the page-world half of a feature (`"world": "MAIN"`), for things only
  reachable from the page: AG Grid apis (via the React fiber), the CodeMirror instance, the model
  Save request. No `chrome.*` there; the isolated half talks to it with a `CustomEvent` on
  `document` (JSON string `detail`) or an attribute on `<html>`.

### Background (`src/background/`)

- `service-worker.js` — install / update (runs config migrations), toggles the panel on icon click
  (injects the panel scripts if the tab has none yet). Hotkeys never go through it: the content
  script handles `keydown` itself (the browser command was removed in v1.6.1).
- `detached-window.js` — "Pop out" (⧉ in the panel): opens `popup.html?detached=1` as a
  `type: "popup"` window or focuses the open one (found with `runtime.getContexts`), at the last
  saved position. The window (`src/popup/live-context.js`) follows the active tab and asks its
  `ab-key-panel-host.js` for the context (`AB_KEY_PANEL_CONTEXT`: host, path, rail and nav labels).
- `config-store.js` — read-through config cache with migration on read; dropped on
  `storage.onChanged`.

### Shared (`src/shared/`)

- `config-schema.js` — default config (actions, hotkeys, feature flags), versioned migrations
  (schema v10), shape validation, and `lintConfig` (warnings for hotkeys that cannot fire). Changing
  defaults of a shipped config needs a new migration that replaces only shipped values and keeps
  user edits.
- `errors.js` — error codes (`ElementNotFound`, `OverlayBlocked`, `TimeoutExceeded`, …).
- `logger.js` — service worker console logs (`[AB-key]` prefix); nothing is stored. Hotkey
  diagnostics are `console.debug` lines in the page console, also `[AB-key]`.

### UI

- `src/options/` — options page: feature toggles, the config JSON (hotkeys and actions), import /
  export, diagnostics logging. The JSON is what Save stores; each toggle's id is a config flag and
  mirrors it (`config-form.js`), and Save shows `lintConfig` warnings.
- `src/popup/` — hotkeys for the current page, shown in the in-page panel.

## Hotkeys

`content-script.js` listens to `keydown` on `window` (capture phase). A hotkey matches by the
physical key (`event.code`), so it works with any keyboard layout. Each hotkey has `hosts` and
optional `paths` (e.g. model-only hotkeys), checked at keypress time because Abacum is a SPA.
The matched action runs in the page directly; the service worker is not involved.

## Actions

An action is `{ actionId, locatorProfile, executionPolicy }`.

**Finding the element** (`locatorProfile`):

1. `toolbarRail.position` / `sidebarNav.position` — positional lookup via the helpers above.
2. `preferredSelectors` — tried strictly in order; the first visible, enabled, uncovered match wins.
3. Scored search over `selectorCandidates` (CSS), `ariaCriteria` and `textCriteria`
   (contains / exact / regex), with deterministic tiebreakers.

**Running it** (`executionPolicy`):

- `preActions` (e.g. `blurActiveElement`) before the first step.
- `steps` — a sequence of locators clicked one after another (e.g. "+" → Create variable); a step's
  `trigger: "contextmenu"` opens the element's right-click menu instead of clicking.
- `alternatives` — several step lists; the first whose first step finds its element runs (e.g. bulk
  toolbar when rows are ticked, else the focused row's menu).
- `retryPolicy` (`attempts`, `intervalMs`, `useMutationObserver`) and `timeoutMs` — elements are
  re-queried on every attempt; between attempts the script waits for a DOM mutation or the interval.
- Before clicking, a hit test reports `OverlayBlocked` when another node covers the element.

Result: `{ ok: true, elapsedMs, matchedScore }` or `{ ok: false, error: { code, message }, elapsedMs }`.

## Extending

- New hotkey on an existing kind of target: add an action and a hotkey to the default config with a
  migration and a test (`tests/config-migration.test.mjs`, `tests/locators.test.mjs`).
- New feature: a new `src/content/abacum-<name>.js` (plus `-main.js` if it needs page objects), a
  flag in the config with an options toggle, a `manifest.json` entry, and a test using
  `tests/helpers.mjs`.
