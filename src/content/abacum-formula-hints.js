// Formula autocomplete beside the Cell Editor (Abacum models).
//
// The formula Cell Editor is an AG Grid popup editor with a CodeMirror 5 input. CodeMirror's
// hint list (ul.CodeMirror-hints, appended to <body>) is placed at the caret and often opens
// above it, covering the formula. This script moves the list next to the editor: to its right,
// top-aligned; to its left when the right side has no room; untouched when neither side fits.
//
// DOM facts (verified Nov 2026):
// - Editor: .ag-popup-editor[role=dialog] containing [data-testid="testid-codemirror"].
// - The hint list is removed and re-created on every keystroke, so <body> children are watched
//   (no subtree). CodeMirror also rewrites the list's inline left/top when the editor scrolls,
//   so the current list's style attribute is watched too.
// - Nothing runs while no formula editor has focus: observers start on focusin into the editor
//   and stop on focusout.
//
// Classic content script, always on (no option).
(function () {
  "use strict";

  if (globalThis.AbKeyFormulaHints) return;

  const EDITOR = ".ag-popup-editor";
  const FORMULA_INPUT = "[data-testid='testid-codemirror']";
  const HINTS = "ul.CodeMirror-hints";
  const GAP_PX = 8;
  const MARGIN_PX = 8;

  let editor = null; // the open formula editor while its input has focus
  let bodyObserver = null;
  let styleObserver = null;
  let watchedList = null;

  // ---------------------------------------------------------------------------
  // Pure helper (exported for tests)
  // ---------------------------------------------------------------------------

  /**
   * Where to put a list of size `list` ({width, height}) next to `box` (editor rect) inside a
   * viewport of size `view` ({width, height}). Returns {left, top} or null when neither side fits.
   */
  function placeBeside(box, list, view) {
    let left;
    if (box.right + GAP_PX + list.width <= view.width - MARGIN_PX) left = box.right + GAP_PX;
    else if (box.left - GAP_PX - list.width >= MARGIN_PX) left = box.left - GAP_PX - list.width;
    else return null;
    const top = Math.max(MARGIN_PX, Math.min(box.top, view.height - list.height - MARGIN_PX));
    return { left: Math.round(left), top: Math.round(top) };
  }

  // ---------------------------------------------------------------------------
  // DOM
  // ---------------------------------------------------------------------------

  function editorOf(node) {
    if (!node?.closest?.(FORMULA_INPUT)) return null;
    return node.closest(EDITOR);
  }

  function position(list) {
    if (!editor || !list?.isConnected) return;
    const box = editor.getBoundingClientRect();
    const rect = list.getBoundingClientRect();
    if (!box.width || !rect.width) return;
    const place = placeBeside(box, rect, { width: window.innerWidth, height: window.innerHeight });
    if (!place) return;
    const left = `${place.left}px`;
    const top = `${place.top}px`;
    // Writing the same values again would only re-trigger the style observer.
    if (list.style.left !== left) list.style.left = left;
    if (list.style.top !== top) list.style.top = top;
  }

  function watchList(list) {
    if (list === watchedList) return;
    styleObserver?.disconnect();
    watchedList = list;
    if (!list) return;
    styleObserver = new MutationObserver(() => position(watchedList));
    styleObserver.observe(list, { attributes: true, attributeFilter: ["style"] });
  }

  function update() {
    const list = document.querySelector(HINTS);
    watchList(list);
    position(list);
  }

  function onViewportChange() {
    position(watchedList);
  }

  function start(nextEditor) {
    editor = nextEditor;
    if (!bodyObserver) {
      bodyObserver = new MutationObserver(update);
      bodyObserver.observe(document.body, { childList: true });
      window.addEventListener("resize", onViewportChange);
      document.addEventListener("scroll", onViewportChange, true);
    }
    update();
  }

  function stop() {
    editor = null;
    bodyObserver?.disconnect();
    bodyObserver = null;
    watchList(null);
    window.removeEventListener("resize", onViewportChange);
    document.removeEventListener("scroll", onViewportChange, true);
  }

  // ---------------------------------------------------------------------------
  // Wiring
  // ---------------------------------------------------------------------------

  document.addEventListener(
    "focusin",
    (event) => {
      const found = editorOf(event.target);
      if (found) start(found);
    },
    true
  );

  // Clicking a hint blurs the input for a moment (CodeMirror refocuses it), so decide after the
  // focus has settled; a later focusin starts again anyway.
  document.addEventListener(
    "focusout",
    () => {
      setTimeout(() => {
        if (!editor) return;
        if (!editor.isConnected || !editorOf(document.activeElement)) stop();
      }, 0);
    },
    true
  );

  globalThis.AbKeyFormulaHints = Object.freeze({
    placeBeside,
    update,
    isActive: () => Boolean(bodyObserver)
  });
})();
