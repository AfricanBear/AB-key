// Dataset Viewer: the f chip in a column header selects that column's transformation step.
//
// Abacum shows an f chip in the header of every column a transformation writes. Clicking it
// natively shows the column in the Transform panel header and highlights the column, but the
// steps list keeps its old selection. With the Transform panel open, this script then clicks the
// last step that writes the same column (steps are `[data-rfd-draggable-id="<index>-<column>"]`),
// which is what clicking the step by hand does. Cell clicks (range sum) and header label clicks
// (sorting) are left alone. Reads config.datasetTransformLinkEnabled (Options page).
// Classic content script; no ES modules here.
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

  let enabled = true;

  // Missing setting (config not migrated yet) counts as enabled, matching the default.
  const isEnabled = (config) => config?.datasetTransformLinkEnabled !== false;

  /** The column id of the header whose f chip was clicked, or null for any other click. */
  function chipColumn(target) {
    const chip = target?.closest?.(CHIP_SELECTOR);
    if (!chip || !chip.querySelector(FUNCTION_ICON_SELECTOR)) return null;
    const header = chip.closest(HEADER_SELECTOR);
    return header ? header.getAttribute("col-id") : null;
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

  chrome.storage.local
    .get(CONFIG_KEY)
    .then((data) => (enabled = isEnabled(data?.[CONFIG_KEY])))
    .catch(() => (enabled = true));

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[CONFIG_KEY]) return;
    enabled = isEnabled(changes[CONFIG_KEY].newValue);
  });
})();
