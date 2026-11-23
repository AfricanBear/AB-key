// Model Save after deleting a never-saved variable — settings part.
//
// Reads config.unsavedVariableDeleteFixEnabled (Options page) and mirrors it into the
// data-ab-key-save-fix attribute on <html>. The page-world script abacum-model-save-fix-main.js
// checks that attribute on every model save, so toggling applies to open tabs at once.
// Classic content script; no ES modules here.
(function () {
  "use strict";

  if (globalThis.__abKeyModelSaveFixReady) return;
  globalThis.__abKeyModelSaveFixReady = true;

  const CONFIG_KEY = "mv3ClickAutomation.config"; // keep in sync with src/shared/config-schema.js
  const ENABLED_ATTR = "data-ab-key-save-fix"; // keep in sync with abacum-model-save-fix-main.js

  function setEnabled(enabled) {
    if (enabled) document.documentElement.setAttribute(ENABLED_ATTR, "on");
    else document.documentElement.removeAttribute(ENABLED_ATTR);
  }

  // Missing setting (config not migrated yet) counts as enabled, matching the default.
  const isEnabled = (config) => config?.unsavedVariableDeleteFixEnabled !== false;

  chrome.storage.local
    .get(CONFIG_KEY)
    .then((data) => setEnabled(isEnabled(data?.[CONFIG_KEY])))
    .catch(() => setEnabled(true));

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[CONFIG_KEY]) return;
    setEnabled(isEnabled(changes[CONFIG_KEY].newValue));
  });
})();
