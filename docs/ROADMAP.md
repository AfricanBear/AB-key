# Roadmap — AB-key

Planned features not yet shipped. See [`PROJECT_STATUS.md`](PROJECT_STATUS.md) for what is already released.

---

## Higher contrast model cells

**Status:** Planned  
**Target:** `*.abacum.io` (model / grid views)

### Goal

Improve readability of model cells by increasing visual separation from surrounding UI.

### Proposed behavior

When enabled, inject styles that set **opacity to `0.5`** on Abacum model cell classes:

| Class | Rule |
|-------|------|
| `.css-kdwx3d` | `opacity: 0.5 !important;` |
| `.css-fjadjf` | `opacity: 0.5 !important;` |

Example CSS (implementation sketch):

```css
.css-kdwx3d,
.css-fjadjf {
  opacity: 0.5 !important;
}
```

### Implementation notes (when built)

- Follow the same pattern as **Light theme nav** (`src/content/abacum-light-nav.js`):
  - Dedicated content script on `*://*.abacum.io/*`
  - Options toggle (e.g. `higherContrastModelCellsEnabled`) in config schema and options page
  - Inject/remove a `<style>` block on config change; re-check on SPA navigation if needed
- Add manifest `content_scripts` entry and release notes entry on ship.
- Verify on live Abacum model views; class hashes may change — document selectors in release notes.

### Test plan (draft)

- [ ] Toggle off: cells use default Abacum styling.
- [ ] Toggle on: both classes render at 0.5 opacity on model grid.
- [ ] Toggle persists across reload; refresh open tabs after change.
- [ ] No conflict with light theme nav or hotkey automation.

---

## Dataset range selection sum tooltip

**Status:** Planned  
**Target:** `*.abacum.io` — **Dataset** pages only (not Model)

### Problem

On Dataset grids, selecting numeric cells does not show a quick **Sum** / **Avg** summary. On Model, Abacum already provides `[data-testid="range-selection-tooltip"]`; this feature avoids duplicating that on Model.

### Goal

When the user drag-selects cells on a Dataset page:

1. Detect selection via AG Grid range classes: `ag-cell-range-selected`, `ag-cell-range-selected-1`, and any `ag-cell-range-selected*`.
2. Parse numeric values from `.ag-cell-value` in those cells (skip non-numeric).
3. Show a floating tooltip styled like Abacum’s native range tooltip: title (`N selected values`), **Sum**, **Avg**.

**Constraints:** Always on (no options toggle). DOM-based only; no Abacum bundle hooks.

### DOM anchors

| Element | Selector |
|---------|----------|
| Grid | `.ag-root` |
| Selected cells | `.ag-root .ag-cell[class*='ag-cell-range-selected']` |
| Cell text | `.ag-cell-value` |

### Implementation notes (when built)

- New content script: `src/content/abacum-dataset-range-sum.js`
- Manifest entry on `*://*.abacum.io/*`; page gate inside script, e.g. `pathname` matches `/datasets?/`
- Triggers: `mouseup`/`pointerup` on grid + `MutationObserver` on cell `class` (debounced ~50–80 ms)
- Tooltip: `data-testid="ab-key-range-selection-tooltip"`; dark panel; position at bottom-right of selection union rect
- **Known limit:** AG Grid virtualizes rows — sum includes **visible** selected cells only

### Test plan (draft)

- [ ] Dataset: select two measure cells → correct Sum and Avg
- [ ] Clear selection → tooltip hides
- [ ] Model range select → AB-key tooltip does **not** appear (native Abacum tooltip unchanged)
- [ ] No conflict with hotkeys, tab title, light nav

---

## Formula autocomplete locked to the side

**Status:** Planned  
**Target:** `*.abacum.io` — **Model** (formula Cell Editor), not Dataset

### Problem

CodeMirror autocomplete (`ul.CodeMirror-hints`, e.g. `#cm-complete-0`) is positioned at the **caret** via inline `left` / `top`. The list overlaps the formula in the **Cell Editor** (`role="dialog"`, `aria-label="Cell Editor"`), causing misclicks while editing.

### Goal

Anchor the hints list to the **right** of the Cell Editor popup (small gap), vertically aligned with the editor top—so it no longer covers the formula text.

### DOM anchors (from DevTools / FormulaEditor bundle)

| Element | Selector |
|---------|----------|
| Editor shell | `.ag-popup-editor[aria-label="Cell Editor"]` |
| Formula UI | `[data-testid="formula-presets-wrapper"]` |
| Autocomplete | `ul.CodeMirror-hints[role="listbox"]` |

Hints are appended outside the editor; CodeMirror resets position on each keystroke (`FormulaEditor-*.js`, `.CodeMirror-hints` in `FormulaEditor-*.css`).

### Implementation notes (when built)

- New content script on `*://*.abacum.io/*`; gate when Cell Editor is open (not on Dataset-only flows)
- On visible hints: `left = editorRect.right + 8px`, `top = editorRect.top`; clamp to viewport
- Re-apply via `MutationObserver` on hints `style`, editor `style`, scroll, and debounced `requestAnimationFrame` while hints are open
- DOM reposition only—do not patch Abacum bundles
- Always on (no options toggle)

### Test plan (draft)

- [ ] Model: open Cell Editor → autocomplete sits **right** of editor, not on caret
- [ ] Typing / arrow keys → list stays anchored; formula text not covered
- [ ] Editor moves → hints follow
- [ ] Close editor → no reposition loop
- [ ] Dataset / range-sum tooltip unaffected

---

## Backlog (ideas)

- Toolbar rail: verify behaviour with a panel open and on a single version page (v0.6.0 checked only with panels closed)
- Alt+A / Alt+C: restrict text matching to interactive elements to avoid wrong clicks
- Light theme nav and tab title still rely on hashed `css-*` classes / first `img[alt]`

- Automated tests for selector engine and config migration
- CI: manifest validation + packaging on push/PR
- Shortkeys.txt import utility
- Diagnostics panel in options
- Narrow `host_permissions` from `<all_urls>` where possible
