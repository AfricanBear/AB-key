// Dataset Viewer: the f chip in a column header selects that column's transformation step.
//
// Abacum shows an f chip in the header of every column a transformation writes. Clicking it
// natively shows the column in the Transform panel header and highlights the column, but the
// steps list keeps its old selection. With the Transform panel open, this script then clicks the
// last step that writes the same column (steps are `[data-rfd-draggable-id="<index>-<column>"]`),
// which is what clicking the step by hand does. Cell clicks (range sum) and header label clicks
// (sorting) are left alone.
//
// Abacum gives the chip a pointer cursor but no hover or press state, so while the feature is on
// the chip gets one (like the pin button) and a tooltip. Reads config.datasetTransformLinkEnabled
// (Options page). Classic content script; no ES modules here.
(function () {
  "use strict";

  if (globalThis.__abKeyDatasetTransformLinkReady) return;
  globalThis.__abKeyDatasetTransformLinkReady = true;

  const CONFIG_KEY = "mv3ClickAutomation.config"; // keep in sync with src/shared/config-schema.js
  const CHIP_SELECTOR = '[data-testid="testid-abax-chip"]';
  const FUNCTION_ICON_SELECTOR = '[data-testid="function-icon"]';
  const HEADER_SELECTOR = ".ag-header-cell[col-id]";
  const STEP_SELECTOR = '[data-rfd-droppable-id="transformations-dnd-list"] [data-rfd-draggable-id]';
  const STEP_ID = /^(\d+)-(.*)$/;
  const ENABLED_ATTR = "data-ab-key-transform-link"; // on <html> while the feature is on
  const TITLE_MARK = "data-ab-key-title"; // marks a title this script set
  const STYLE_ID = "ab-key-transform-link-style";
  const TOOLTIP = "Show transformation step";

  // Abacum's chip: 20×20, radius 4, background #dbeafe, icon #193cb8 (MUI primary chip).
  const CHIP = `html[${ENABLED_ATTR}] ${HEADER_SELECTOR} ${CHIP_SELECTOR}:has(${FUNCTION_ICON_SELECTOR})`;
  const CSS = `
${CHIP} { transition: background-color .12s, box-shadow .12s; }
${CHIP}:hover { background-color: #bfdbfe; box-shadow: 0 0 0 1px #93c5fd; }
${CHIP}:active { background-color: #93c5fd; box-shadow: none; }
`;

  let enabled = true;

  // Missing setting (config not migrated yet) counts as enabled, matching the default.
  const isEnabled = (config) => config?.datasetTransformLinkEnabled !== false;

  function setEnabled(value) {
    enabled = value;
    const root = document.documentElement;
    if (!root) return;
    if (value) {
      root.setAttribute(ENABLED_ATTR, "on");
      if (!document.getElementById(STYLE_ID)) {
        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = CSS;
        (document.head || root).appendChild(style);
      }
    } else {
      root.removeAttribute(ENABLED_ATTR);
    }
  }

  /** The f chip under `target` (an element inside it), or null. */
  function functionChip(target) {
    const chip = target?.closest?.(CHIP_SELECTOR);
    return chip && chip.querySelector(FUNCTION_ICON_SELECTOR) && chip.closest(HEADER_SELECTOR) ? chip : null;
  }

  /** The column id of the header whose f chip was clicked, or null for any other click. */
  function chipColumn(target) {
    const chip = functionChip(target);
    return chip ? chip.closest(HEADER_SELECTOR).getAttribute("col-id") : null;
  }

  /** The last step in the Transform panel that writes `column`, or null (panel closed, no step). */
  function lastStepFor(column) {
    let found = null;
    for (const step of document.querySelectorAll(STEP_SELECTOR)) {
      const match = STEP_ID.exec(step.getAttribute("data-rfd-draggable-id") || "");
      if (match && match[2] === column) found = step;
    }
    return found;
  }

  function selectStep(column) {
    const step = lastStepFor(column);
    if (!step || step.classList.contains("Mui-selected")) return;
    step.scrollIntoView?.({ block: "nearest" });
    step.click();
  }

  // Bubble phase on document: Abacum's own chip handler (React, on its root) runs first; the step
  // is clicked on the next tick so its details win over the column details the chip just showed.
  document.addEventListener("click", (event) => {
    if (!enabled || event.button !== 0) return;
    const column = chipColumn(event.target);
    if (column) setTimeout(() => selectStep(column), 0);
  });

  // The tooltip is set when the pointer reaches a chip (headers are re-rendered by AG Grid), and
  // taken back if the feature was switched off meanwhile. Abacum sets no title of its own here.
  document.addEventListener("pointerover", (event) => {
    const chip = functionChip(event.target);
    if (!chip) return;
    if (enabled && !chip.hasAttribute("title")) {
      chip.setAttribute("title", TOOLTIP);
      chip.setAttribute(TITLE_MARK, "");
    } else if (!enabled && chip.hasAttribute(TITLE_MARK)) {
      chip.removeAttribute("title");
      chip.removeAttribute(TITLE_MARK);
    }
  });

  chrome.storage.local
    .get(CONFIG_KEY)
    .then((data) => setEnabled(isEnabled(data?.[CONFIG_KEY])))
    .catch(() => setEnabled(true));

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[CONFIG_KEY]) return;
    setEnabled(isEnabled(changes[CONFIG_KEY].newValue));
  });
})();
