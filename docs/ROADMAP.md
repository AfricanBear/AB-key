# Roadmap — AB-key

Planned features not yet shipped. See [`PROJECT_STATUS.md`](PROJECT_STATUS.md) for what is already released.

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

- **Esc closes Abacum modals** such as Edit Dimensions (`module-builder-dbv-modal`, opened by Alt+E). Today Esc does not close it. Must not discard unsaved changes silently and must not interfere with Esc inside cell editors, CodeMirror formula hints or open menus.
- Toolbar rail: verify behaviour with a panel open and on a single version page (v0.6.0 checked only with panels closed)
- Light theme nav and tab title still rely on hashed `css-*` classes / first `img[alt]`

- Shortkeys.txt import utility
- Diagnostics panel in options
- Narrow `host_permissions` from `<all_urls>` where possible
