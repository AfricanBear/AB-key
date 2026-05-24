# Release Notes

## v0.5.0 — Index-based toolbar hotkeys

### Included changes

- Alt+1–5 use **toolbar index** targeting for the Abacum side icon rail (`container + nth-child`).
- Alt+1–4 keep **aria-label fallback** if index click fails.
- Alt+5 added for the fifth rail button (index-only; aria label unknown).
- Key repeat ignored on hotkey handler (`event.repeat`).

### Upgrade

- Reload the extension after updating. Existing configs migrate automatically.

---

## v0.4.1 — Options layout

### Included changes

- **Save** moved to the header (top right).
- **Reload**, **Export**, and **Import** moved into a toolbar inside the Configuration card.

### Upgrade

- Reload the extension after updating.

---

## v0.4.0 — Light theme nav for Abacum

### Included changes

- **Light theme nav** toggle in options; injects styles on all `*.abacum.io` pages.
- Drawer gradient, white nav accents (`.css-s8husd`, `.css-s9zrci`), lavender active state (`.css-s7gj1v`).
- Options preview images (default vs light nav) beside the toggle.

### Upgrade

- Reload the extension, enable the toggle in options, and refresh Abacum tabs.

---

## v0.3.1 — Popup label updates

### Included changes

- Popup labels: “Bulk Dimensions” → “Edit Dimensions”; “Add then” → “Context: Add + Create variable”.
- Popup width adjusted for longer labels.

### Upgrade

- Reload the extension after updating.

---

## v0.3.0 — Options UI redesign

### Included changes

- Options page restyled with dark glassmorphism theme (aligned with Abacum reference and toolbar popup).
- Extension icon shown in the options header.

### Upgrade

- Reload the extension after updating.

---

## v0.2.2 — Toolbar hotkey popup

### Included changes

- Added toolbar popup (`default_popup`) listing Abacum hotkeys with short labels and key bindings.
- Dark glass-style panel opened from the extension icon.

### Upgrade

- Reload the extension after updating.

---

## v0.2.1 — Options and tab title toggle

### Included changes

- Abacum tab title feature is configurable via the options page (`abacumTabTitleEnabled`).
- Options window renamed to **A+B key** (was “MV3 Click Automation”).
- Tab title script respects storage changes; open Abacum tabs may still need a refresh in some cases.

### Upgrade

- Reload the extension after updating.

---

## v0.2.0 — Abacum tab title

### Included changes

- Added `src/content/abacum-tab-title.js`: prefixes the browser tab title with the client name from the first non-empty `img[alt]` on `app.abacum.io`.
- Watches DOM mutations and re-applies the prefix on an interval so React title updates do not overwrite it.
- Manifest `content_scripts` entry scoped to `https://app.abacum.io/*`.

### Upgrade

- Reload the extension (or reinstall from `dist/AB-key.zip` / `dist/AB-key-opera.zip` after packaging).

---

## v0.1.0 — Opera Adaptation

## Scope

This release adapts the MV3 Click Automation extension for Opera (Chromium-based) distribution and setup.

## Included Changes

- Added Opera compatibility checklist: `docs/OPERA_COMPATIBILITY.md`.
- Added Opera quick-start and troubleshooting to `README.md`.
- Updated packaging script to support Opera-labeled artifact:
  - `scripts/package.ps1 -Target opera`
  - output: `dist/AB-key-opera.zip`
- Added Opera smoke test checklist: `docs/OPERA_SMOKE_TEST.md`.

## Known Limitations

- Content scripts cannot run on restricted internal pages (`opera://*`, store pages, and other protected contexts).
- Iframe boundary behavior depends on page structure; cross-origin iframes remain constrained.
- Shortcut conflicts may require manual rebind in `opera://extensions/shortcuts`.

## Rollout Notes

- Use unpacked install first for verification.
- Promote packaged zip after smoke test completion on target workloads.
