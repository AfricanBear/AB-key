// Formula editor keys — settings part.
//
// Mirrors two Options page settings into attributes on <html>:
// - config.formulaWordDeleteEnabled -> data-ab-key-word-delete (Ctrl+Backspace deletes one word)
// - config.formulaMultiEditEnabled  -> data-ab-key-multi-edit (highlight matches, Alt+Backspace
//   edits all of them at once)
// The page-world script abacum-formula-keys-main.js checks them on every key, so toggling applies
// to open tabs at once.
// Classic content script; no ES modules here.
(function () {
  "use strict";

  if (globalThis.__abKeyFormulaKeysReady) return;
  globalThis.__abKeyFormulaKeysReady = true;

  const CONFIG_KEY = "mv3ClickAutomation.config"; // keep in sync with src/shared/config-schema.js
  // Attribute -> config field; keep the attributes in sync with abacum-formula-keys-main.js.
  const SETTINGS = [
    ["data-ab-key-word-delete", "formulaWordDeleteEnabled"],
    ["data-ab-key-multi-edit", "formulaMultiEditEnabled"]
  ];

  // Missing setting (config not migrated yet) counts as enabled, matching the defaults.
  function apply(config) {
    for (const [attr, field] of SETTINGS) {
      if (config?.[field] !== false) document.documentElement.setAttribute(attr, "on");
      else document.documentElement.removeAttribute(attr);
    }
  }

  chrome.storage.local
    .get(CONFIG_KEY)
    .then((data) => apply(data?.[CONFIG_KEY]))
    .catch(() => apply(null));

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[CONFIG_KEY]) return;
    apply(changes[CONFIG_KEY].newValue);
  });
})();
