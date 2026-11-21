// Word-wise delete in the Abacum formula editor — page-world part.
//
// Abacum's formula editor is CodeMirror 5 ([data-testid="testid-codemirror"]). Abacum binds
// Ctrl-Backspace and Cmd-Backspace in extraKeys to `e => e.setValue("")`, so the shortcut every
// text field uses to delete one word wipes the whole formula. Ctrl-Delete is not rebound and
// already deletes the next word (CodeMirror's default keymap).
//
// When enabled, a capture-phase keydown listener on window runs before CodeMirror and calls the
// editor's own commands instead:
// - Ctrl+Backspace -> delGroupBefore (the word left of the cursor; a selection is deleted as is;
//   a variable chip is an atomic range, so it goes as a whole).
// - Cmd+Backspace (Mac) -> delWrappedLineLeft (to the start of the line, as in Mac text fields).
//
// Runs in the MAIN world ("world": "MAIN" in the manifest) because the CodeMirror instance
// (the .CodeMirror element's CodeMirror property) is not visible from the isolated world. No
// chrome.* here: the isolated script abacum-formula-keys.js reads config.formulaWordDeleteEnabled
// and mirrors it into the ENABLED_ATTR attribute on <html>, which both worlds see.
(function () {
  "use strict";

  if (globalThis.AbKeyFormulaKeysMain) return;

  const ENABLED_ATTR = "data-ab-key-word-delete"; // keep in sync with abacum-formula-keys.js
  const EDITOR = '[data-testid="testid-codemirror"]';

  /** CodeMirror command for a keydown, or null when the key is not ours. */
  function commandFor(event) {
    if (event.key !== "Backspace" || event.altKey || event.shiftKey || event.isComposing) return null;
    if (event.ctrlKey && !event.metaKey) return "delGroupBefore";
    if (event.metaKey && !event.ctrlKey) return "delWrappedLineLeft";
    return null;
  }

  /** The CodeMirror instance whose input received the event, if it is a formula editor. */
  function editorOf(target) {
    const host = target && typeof target.closest === "function" ? target.closest(".CodeMirror") : null;
    if (!host || !host.closest(EDITOR)) return null;
    const cm = host.CodeMirror;
    return cm && typeof cm.execCommand === "function" ? cm : null;
  }

  function onKeyDown(event) {
    if (document.documentElement.getAttribute(ENABLED_ATTR) !== "on") return;
    const command = commandFor(event);
    if (!command) return;
    const cm = editorOf(event.target);
    if (!cm || (typeof cm.isReadOnly === "function" && cm.isReadOnly())) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    cm.execCommand(command);
  }

  window.addEventListener("keydown", onKeyDown, true);

  globalThis.AbKeyFormulaKeysMain = { commandFor, editorOf, ENABLED_ATTR };
})();
