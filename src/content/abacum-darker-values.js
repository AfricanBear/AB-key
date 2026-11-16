// Darker values in Abacum model cells.
//
// Abacum renders model values in a muted grey (rgb 82,82,82) set on the value-cell container,
// while the surrounding grid text is near-black (rgb 23,23,23). When enabled, this script gives
// value cells the grid's own text colour. Only the inherited colour changes: children with their
// own colour (pencil icon, any coloured values) keep it.
//
// Read-only values (variables linked from another model, and the dimension rows shown on
// expand) are paler still: the value-cell has the class disabled-value-cell and its
// .cell-value child has opacity 0.4 and its own grey. Those get the same colour at opacity
// 0.85, so they stay slightly lighter than editable values but are easy to read.
//
// Anchored on Abacum's stable data-testid="value-cell" and its semantic classes
// (disabled-value-cell, cell-value), not on hashed css-* classes.
// Classic content script; toggle: config.darkerModelValuesEnabled (Options page).
(function () {
  "use strict";

  if (globalThis.__abKeyDarkerValuesReady) return;
  globalThis.__abKeyDarkerValuesReady = true;

  const CONFIG_KEY = "mv3ClickAutomation.config"; // keep in sync with src/shared/config-schema.js
  const STYLE_ID = "ab-key-darker-model-values";
  const CSS = [
    '[data-testid="value-cell"] { color: rgb(23, 23, 23) !important; }',
    '[data-testid="value-cell"].disabled-value-cell > .cell-value { color: rgb(23, 23, 23) !important; opacity: 0.85 !important; }'
  ].join("\n");

  function setEnabled(enabled) {
    const existing = document.getElementById(STYLE_ID);
    if (!enabled) {
      existing?.remove();
      return;
    }
    if (existing) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = CSS;
    (document.head || document.documentElement).appendChild(style);
  }

  // Missing setting (config not migrated yet) counts as enabled, matching the default.
  const isEnabled = (config) => config?.darkerModelValuesEnabled !== false;

  chrome.storage.local
    .get(CONFIG_KEY)
    .then((data) => setEnabled(isEnabled(data?.[CONFIG_KEY])))
    .catch(() => setEnabled(true));

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[CONFIG_KEY]) return;
    setEnabled(isEnabled(changes[CONFIG_KEY].newValue));
  });
})();
