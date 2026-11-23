// Dimensions under each variable in the model builder — settings part.
//
// Mirrors two things into the data-ab-key-model-dims attribute on <html>, which the page-world
// script abacum-model-dimensions-main.js reads:
//   absent   - feature off (config.modelDimensionsEnabled === false): no button, no chips
//   "hidden" - feature on, dimensions hidden (the default)
//   "shown"  - feature on, dimensions shown
// Shown / hidden is one switch for every model, kept in chrome.storage.local under
// VISIBLE_KEY. The page-world button asks to flip it with the TOGGLE_EVENT CustomEvent.
// Classic content script; no ES modules here.
(function () {
  "use strict";

  if (globalThis.__abKeyModelDimensionsReady) return;
  globalThis.__abKeyModelDimensionsReady = true;

  const CONFIG_KEY = "mv3ClickAutomation.config"; // keep in sync with src/shared/config-schema.js
  const VISIBLE_KEY = "abKey.modelDimensionsVisible";
  const ATTR = "data-ab-key-model-dims"; // keep in sync with abacum-model-dimensions-main.js
  const TOGGLE_EVENT = "ab-key:model-dims-toggle"; // keep in sync with abacum-model-dimensions-main.js

  let enabled = true;
  let visible = false;

  function render() {
    if (!enabled) document.documentElement.removeAttribute(ATTR);
    else document.documentElement.setAttribute(ATTR, visible ? "shown" : "hidden");
  }

  // Missing setting (config not migrated yet) counts as enabled, matching the default.
  const isEnabled = (config) => config?.modelDimensionsEnabled !== false;

  chrome.storage.local
    .get([CONFIG_KEY, VISIBLE_KEY])
    .then((data) => {
      enabled = isEnabled(data?.[CONFIG_KEY]);
      visible = data?.[VISIBLE_KEY] === true;
      render();
    })
    .catch(() => render());

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes[CONFIG_KEY]) enabled = isEnabled(changes[CONFIG_KEY].newValue);
    if (changes[VISIBLE_KEY]) visible = changes[VISIBLE_KEY].newValue === true;
    if (changes[CONFIG_KEY] || changes[VISIBLE_KEY]) render();
  });

  document.addEventListener(TOGGLE_EVENT, () => {
    if (!enabled) return;
    visible = !visible;
    render(); // at once; storage then tells the other tabs
    chrome.storage.local.set({ [VISIBLE_KEY]: visible }).catch(() => {});
  });
})();
