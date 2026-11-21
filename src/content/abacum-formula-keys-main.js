// Formula editor keys — page-world part.
//
// Abacum's formula editor is CodeMirror 5 ([data-testid="testid-codemirror"]). Two features,
// each with its own option (mirrored into an attribute on <html> by abacum-formula-keys.js):
//
// 1. Word-wise delete (WORD_DELETE_ATTR). Abacum binds Ctrl-Backspace and Cmd-Backspace in
//    extraKeys to `e => e.setValue("")`, so the shortcut every text field uses to delete one word
//    wipes the whole formula. Ctrl-Delete is not rebound and already deletes the next word.
//    - Ctrl+Backspace -> delGroupBefore (the word left of the cursor; a selection is deleted as
//      is; a variable chip is an atomic range, so it goes as a whole).
//    - Cmd+Backspace (Mac) -> delWrappedLineLeft (to the start of the line).
//
// 2. Edit all matches (MULTI_EDIT_ATTR).
//    - With one non-empty selection, the same text elsewhere in the formula is highlighted
//      (an overlay for plain text, a class on the widget for variable chips; the document and
//      its marks are not touched).
//    - Alt+Backspace with at least two matches deletes every match and leaves a cursor at each,
//      so typing goes everywhere at once (CodeMirror multiple selections; one undo step).
//      A match that cuts through a variable chip is skipped. With fewer than two matches the key
//      is left alone (on Mac Alt+Backspace keeps deleting the word / selection).
//    - Esc with several cursors goes back to one cursor; Abacum binds Esc to cancel the editor,
//      which would drop the edit. With hints open, Esc still closes the hints first.
//
// A capture-phase keydown listener on window runs before CodeMirror and Abacum's extraKeys.
// Runs in the MAIN world ("world": "MAIN" in the manifest) because the CodeMirror instance
// (the .CodeMirror element's CodeMirror property) is not visible from the isolated world.
// No chrome.* here.
(function () {
  "use strict";

  if (globalThis.AbKeyFormulaKeysMain) return;

  const WORD_DELETE_ATTR = "data-ab-key-word-delete"; // keep in sync with abacum-formula-keys.js
  const MULTI_EDIT_ATTR = "data-ab-key-multi-edit"; // keep in sync with abacum-formula-keys.js
  const EDITOR = '[data-testid="testid-codemirror"]';
  const MATCH_TOKEN = "ab-key-match"; // overlay token -> CSS class cm-ab-key-match
  const CHIP_MATCH_CLASS = "ab-key-match-chip";
  const STYLE_ID = "ab-key-formula-match-style";

  const isOn = (attr) => document.documentElement.getAttribute(attr) === "on";

  /** CodeMirror command for a word-delete keydown, or null when the key is not ours. */
  function commandFor(event) {
    if (event.key !== "Backspace" || event.altKey || event.shiftKey || event.isComposing) return null;
    if (event.ctrlKey && !event.metaKey) return "delGroupBefore";
    if (event.metaKey && !event.ctrlKey) return "delWrappedLineLeft";
    return null;
  }

  const isAltBackspace = (event) =>
    event.key === "Backspace" && event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.isComposing;

  const isPlainEscape = (event) =>
    event.key === "Escape" && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.isComposing;

  /** The CodeMirror instance whose input received the event, if it is a formula editor. */
  function editorOf(target) {
    const host = target && typeof target.closest === "function" ? target.closest(".CodeMirror") : null;
    if (!host || !host.closest(EDITOR)) return null;
    const cm = host.CodeMirror;
    return cm && typeof cm.execCommand === "function" ? cm : null;
  }

  const isReadOnly = (cm) => typeof cm.isReadOnly === "function" && cm.isReadOnly();

  /** Text worth matching: non-empty, one line, not only spaces. */
  const isUsableNeedle = (needle) => typeof needle === "string" && needle.trim() !== "" && !needle.includes("\n");

  /**
   * Non-overlapping occurrences of needle in text as [start, end) offsets, left to right.
   * An occurrence that cuts through an atomic range (a variable chip) without covering it whole
   * is skipped. atomic: [start, end) offsets of the chips.
   */
  function findMatches(text, needle, atomic = []) {
    const matches = [];
    if (!isUsableNeedle(needle)) return matches;
    let from = 0;
    while (from <= text.length - needle.length) {
      const start = text.indexOf(needle, from);
      if (start < 0) break;
      const end = start + needle.length;
      const cutsChip = atomic.some(([a, b]) => start < b && end > a && (start > a || end < b));
      if (cutsChip) {
        from = start + 1;
        continue;
      }
      matches.push([start, end]);
      from = end;
    }
    return matches;
  }

  /** The single non-empty selection as { needle, start, end } offsets, or null. */
  function singleSelection(cm) {
    const ranges = cm.listSelections();
    if (ranges.length !== 1) return null;
    const a = cm.indexFromPos(ranges[0].anchor);
    const b = cm.indexFromPos(ranges[0].head);
    if (a === b) return null;
    const start = Math.min(a, b);
    const end = Math.max(a, b);
    const needle = cm.getValue().slice(start, end);
    return isUsableNeedle(needle) ? { needle, start, end } : null;
  }

  /** Chips: atomic marks as [start, end) offsets, with the mark for its widget. */
  function chipsOf(cm) {
    const chips = [];
    for (const mark of cm.getAllMarks()) {
      if (!mark.atomic) continue;
      const range = mark.find();
      if (!range || !range.from) continue;
      chips.push({ start: cm.indexFromPos(range.from), end: cm.indexFromPos(range.to), mark });
    }
    return chips;
  }

  /** Matches of the current selection, or null when there is nothing to match. */
  function matchesOf(cm) {
    const selection = singleSelection(cm);
    if (!selection) return null;
    const chips = chipsOf(cm);
    const matches = findMatches(
      cm.getValue(),
      selection.needle,
      chips.map((chip) => [chip.start, chip.end])
    );
    return { selection, matches, chips };
  }

  /** Alt+Backspace: delete every match, one cursor at each. Returns true when it acted. */
  function deleteAllMatches(cm) {
    const found = matchesOf(cm);
    if (!found || found.matches.length < 2) return false;
    const { matches, selection } = found;
    const primary = Math.max(0, matches.findIndex(([start]) => start === selection.start));
    const ranges = matches.map(([start, end]) => ({ anchor: cm.posFromIndex(start), head: cm.posFromIndex(end) }));
    const run = () => {
      cm.setSelections(ranges, primary);
      cm.replaceSelection("");
    };
    if (typeof cm.operation === "function") cm.operation(run);
    else run();
    return true;
  }

  // --- Highlight -------------------------------------------------------------------------

  const highlights = new WeakMap(); // cm -> { overlay, chips: Element[] }
  const watched = new WeakSet();

  function ensureStyle() {
    if (!document.head || document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent =
      `.cm-${MATCH_TOKEN}{background:rgba(255,193,7,.35);border-radius:2px}` +
      `.${CHIP_MATCH_CLASS}{outline:2px solid rgba(255,160,0,.85);outline-offset:1px;border-radius:4px}`;
    document.head.appendChild(style);
  }

  function clearHighlight(cm) {
    const current = highlights.get(cm);
    if (!current) return;
    highlights.delete(cm);
    if (current.overlay && typeof cm.removeOverlay === "function") cm.removeOverlay(current.overlay);
    for (const el of current.chips) el.classList.remove(CHIP_MATCH_CLASS);
  }

  /** Overlay mode that marks every occurrence of needle in plain text. */
  function overlayFor(needle) {
    return {
      token(stream) {
        if (stream.match(needle)) return MATCH_TOKEN;
        while (stream.next() != null && !stream.match(needle, false)) {
          // skip to the next occurrence
        }
        return null;
      }
    };
  }

  function updateHighlight(cm) {
    clearHighlight(cm);
    if (!isOn(MULTI_EDIT_ATTR)) return;
    const found = matchesOf(cm);
    if (!found || found.matches.length < 2) return;
    ensureStyle();
    const overlay = overlayFor(found.selection.needle);
    if (typeof cm.addOverlay === "function") cm.addOverlay(overlay);
    // Chips are replaced by widgets, so the overlay cannot show them: mark the widgets whose
    // range lies inside a match.
    const chips = [];
    for (const chip of found.chips) {
      const el = chip.mark.replacedWith;
      if (!el || !el.classList) continue;
      if (found.matches.some(([start, end]) => chip.start >= start && chip.end <= end)) {
        el.classList.add(CHIP_MATCH_CLASS);
        chips.push(el);
      }
    }
    highlights.set(cm, { overlay, chips });
  }

  function watch(cm) {
    if (watched.has(cm) || typeof cm.on !== "function") return;
    watched.add(cm);
    cm.on("cursorActivity", () => updateHighlight(cm));
    cm.on("blur", () => clearHighlight(cm));
  }

  // --- Keys --------------------------------------------------------------------------------

  function consume(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function onKeyDown(event) {
    const cm = editorOf(event.target);
    if (!cm || isReadOnly(cm)) return;

    if (isOn(WORD_DELETE_ATTR)) {
      const command = commandFor(event);
      if (command) {
        consume(event);
        cm.execCommand(command);
        return;
      }
    }

    if (!isOn(MULTI_EDIT_ATTR)) return;
    if (isAltBackspace(event)) {
      if (deleteAllMatches(cm)) consume(event);
      return;
    }
    if (isPlainEscape(event)) {
      const hintsOpen = Boolean(cm.state && cm.state.completionActive);
      if (!hintsOpen && cm.listSelections().length > 1) {
        consume(event);
        cm.execCommand("singleSelection");
      }
    }
  }

  function onFocusIn(event) {
    if (!isOn(MULTI_EDIT_ATTR)) return;
    const cm = editorOf(event.target);
    if (cm) watch(cm);
  }

  window.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("focusin", onFocusIn, true);

  globalThis.AbKeyFormulaKeysMain = {
    commandFor,
    editorOf,
    findMatches,
    deleteAllMatches,
    updateHighlight,
    WORD_DELETE_ATTR,
    MULTI_EDIT_ATTR
  };
})();
