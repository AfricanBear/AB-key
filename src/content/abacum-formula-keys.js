// Word-wise delete in the Abacum formula editor — settings part.
//
// Reads config.formulaWordDeleteEnabled (Options page) and mirrors it into the
// data-ab-key-word-delete attribute on <html>. The page-world script abacum-formula-keys-main.js
// checks that attribute on every Ctrl/Cmd+Backspace, so toggling applies to open tabs at once.
// Classic content script; no ES modules here.
(function () {
  "use strict";

  if (globalThis.__abKeyFormulaKeysReady) return;
  globalThis.__abKeyFormulaKeysReady = true;

  const CONFIG_KEY = "mv3ClickAutomation.config"; // keep in sync with src/shared/config-schema.js
  const ENABLED_ATTR = "data-ab-key-word-delete"; // keep in sync with abacum-formula-keys-main.js

  function setEnabled(enabled) {
    if (enabled) document.documentElement.setAttribute(ENABLED_ATTR, "on");
    else document.documentElement.removeAttribute(ENABLED_ATTR);
  }

  // Missing setting (config not migrated yet) counts as enabled, matching the default.
  const isEnabled = (config) => config?.formulaWordDeleteEnabled !== false;

  chrome.storage.local
    .get(CONFIG_KEY)
    .then((data) => setEnabled(isEnabled(data?.[CONFIG_KEY])))
    .catch(() => setEnabled(true));

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[CONFIG_KEY]) return;
    setEnabled(isEnabled(changes[CONFIG_KEY].newValue));
  });
})();
