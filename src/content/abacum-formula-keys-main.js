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
// 2. Replace all matches (MULTI_EDIT_ATTR): "edit one place, apply everywhere".
//    - With one non-empty selection, the same text elsewhere in the formula is highlighted
//      (an overlay for plain text, a class on the widget for variable chips).
//    - Alt+Backspace with at least two matches deletes every match. The cursor stays where the
//      selection was; the other places get an orange marker. You edit that one place as usual:
//      hints, arrows and Ctrl+Backspace work, because Abacum only ever sees edits in one place
//      (its hint parser breaks when the text changes in several places while typing).
//    - The edited text is copied to every marked place, with Abacum's chip marks, in one
//      CodeMirror operation (one undo step), when you:
//        Enter (no hint list open)  - the Enter is ours; the next Enter applies the formula
//        Esc (no hint list open)    - the Esc is ours; the next Esc cancels the editor
//        move the cursor out of the edited place, or edit outside it
//        leave the editor (click Apply / elsewhere)
//    - Undo / redo before that drops the pending copy. Abacum inserts an operator hint as " -"
//      and then steps over the next space: those spaces join the edited place (and every marked
//      place is extended over the same spaces).
//    - A match that cuts through a variable chip is skipped. With fewer than two matches
//      Alt+Backspace is left alone (on Mac it keeps deleting the word / selection).
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
  const EDITED_CLASS = "ab-key-edited";
  const PENDING_CLASS = "ab-key-pending";
  const APPLY_ORIGIN = "+ab-key-apply";
  const STYLE_ID = "ab-key-formula-match-style";
  const BLUR_DELAY_MS = 150; // a click on a hint blurs the editor for a moment

  const isOn = (attr) => document.documentElement.getAttribute(attr) === "on";

  /** CodeMirror command for a word-delete keydown, or null when the key is not ours. */
  function commandFor(event) {
    if (event.key !== "Backspace" || event.altKey || event.shiftKey || event.isComposing) return null;
    if (event.ctrlKey && !event.metaKey) return "delGroupBefore";
    if (event.metaKey && !event.ctrlKey) return "delWrappedLineLeft";
    return null;
  }

  const noModifiers = (event) => !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.isComposing;
  const isAltBackspace = (event) =>
    event.key === "Backspace" && event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.isComposing;

  /** The CodeMirror instance whose input received the event, if it is a formula editor. */
  function editorOf(target) {
    const host = target && typeof target.closest === "function" ? target.closest(".CodeMirror") : null;
    if (!host || !host.closest(EDITOR)) return null;
    const cm = host.CodeMirror;
    return cm && typeof cm.execCommand === "function" ? cm : null;
  }

  const isReadOnly = (cm) => typeof cm.isReadOnly === "function" && cm.isReadOnly();
  const hintsOpen = (cm) => Boolean(cm.state && cm.state.completionActive);

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

  /**
   * Cursor offsets after deleting the matches (sorted, non-overlapping): each match collapses to
   * its start, shifted left by everything deleted before it. Equal offsets are merged.
   */
  function cursorsAfterDelete(matches) {
    const cursors = [];
    let removed = 0;
    for (const [start, end] of matches) {
      const at = start - removed;
      if (cursors[cursors.length - 1] !== at) cursors.push(at);
      removed += end - start;
    }
    return cursors;
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

  /** Chips: atomic marks with a range, as [start, end) offsets plus the mark. */
  function chipsOf(cm, from = 0, to = Infinity) {
    const chips = [];
    for (const mark of cm.getAllMarks()) {
      if (!mark.atomic) continue;
      const range = mark.find();
      if (!range || !range.from) continue;
      const start = cm.indexFromPos(range.from);
      const end = cm.indexFromPos(range.to);
      if (start >= from && end <= to) chips.push({ start, end, mark });
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

  function ensureStyle() {
    if (!document.head || document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent =
      `.cm-${MATCH_TOKEN}{background:rgba(255,193,7,.35);border-radius:2px}` +
      `.${CHIP_MATCH_CLASS}{outline:2px solid rgba(255,160,0,.85);outline-offset:1px;border-radius:4px}` +
      `.${EDITED_CLASS}{background:rgba(255,193,7,.22);border-radius:2px}` +
      `.${PENDING_CLASS}{display:inline-block;width:6px;height:1.1em;vertical-align:text-bottom;` +
      `margin:0 1px;border:1px dashed rgba(255,140,0,.95);border-radius:2px;background:rgba(255,193,7,.25)}`;
    document.head.appendChild(style);
  }

  // --- Edit one place, apply everywhere ------------------------------------------------------

  const sessions = new WeakMap(); // cm -> pending replace session

  const EDITED_MARK = { inclusiveLeft: true, inclusiveRight: true, clearWhenEmpty: false, className: EDITED_CLASS };

  function rangeOf(cm, marker) {
    const found = marker && marker.find();
    if (!found) return null;
    const from = found.from || found; // a bookmark's find() is a position
    const to = found.to || found;
    if (typeof from.line !== "number") return null;
    return { from: cm.indexFromPos(from), to: cm.indexFromPos(to) };
  }

  /** Ends the session without touching the text (markers and listeners only). */
  function stopReplace(cm) {
    const session = sessions.get(cm);
    if (!session) return;
    sessions.delete(cm);
    if (typeof cm.off === "function") {
      cm.off("beforeChange", session.onBeforeChange);
      cm.off("change", session.onChange);
      cm.off("cursorActivity", session.onCursorActivity);
      cm.off("blur", session.onBlur);
    }
    if (session.blurTimer) clearTimeout(session.blurTimer);
    session.edited.clear();
    for (const place of session.places) place.clear();
  }

  /**
   * Copies the edited text (with chip marks) into every marked place in one operation, then ends
   * the session. A place already followed by the spaces the edited place absorbed gets them
   * replaced, so they are not doubled.
   */
  function applyReplace(cm) {
    const session = sessions.get(cm);
    if (!session) return false;
    const edited = rangeOf(cm, session.edited);
    const value = cm.getValue();
    const targets = session.places.map((place) => rangeOf(cm, place)).filter(Boolean);
    stopReplace(cm);
    if (!edited) return false;
    const text = value.slice(edited.from, edited.to);
    const chips = chipsOf(cm, edited.from, edited.to);
    const absorbed = session.absorbed;
    const run = () => {
      // Right to left, so earlier offsets stay valid.
      for (const at of targets.map((t) => t.from).sort((a, b) => b - a)) {
        const current = cm.getValue();
        const end = absorbed && current.slice(at, at + absorbed.length) === absorbed ? at + absorbed.length : at;
        cm.replaceRange(text, cm.posFromIndex(at), cm.posFromIndex(end), APPLY_ORIGIN);
        for (const chip of chips) {
          const original = chip.mark.replacedWith;
          cm.markText(cm.posFromIndex(at + chip.start - edited.from), cm.posFromIndex(at + chip.end - edited.from), {
            replacedWith: original && typeof original.cloneNode === "function" ? original.cloneNode(true) : undefined,
            atomic: true,
            handleMouseEvents: chip.mark.handleMouseEvents !== false
          });
        }
      }
    };
    if (typeof cm.operation === "function") cm.operation(run);
    else run();
    return true;
  }

  /** The edited place absorbs the spaces the cursor stepped over (see the header). */
  function absorbSpaces(cm, session, gap) {
    if (!/^[ \t]+$/.test(gap)) return false;
    const edited = rangeOf(cm, session.edited);
    if (!edited) return false;
    session.edited.clear();
    session.edited = cm.markText(cm.posFromIndex(edited.from), cm.posFromIndex(edited.to + gap.length), EDITED_MARK);
    session.absorbed += gap;
    return true;
  }

  /** Starts a session: the cursor at primaryIndex is the edited place, the rest get markers. */
  function startReplace(cm, cursors, primaryIndex) {
    stopReplace(cm);
    ensureStyle();
    const primaryOffset = cursors[primaryIndex] ?? cursors[0];
    const primaryPos = cm.posFromIndex(primaryOffset);
    const session = {
      edited: cm.markText(primaryPos, primaryPos, EDITED_MARK),
      places: [],
      absorbed: "",
      ended: null,
      blurTimer: null
    };
    for (const offset of cursors) {
      if (offset === primaryOffset) continue;
      const widget = document.createElement("span");
      widget.className = PENDING_CLASS;
      widget.title = "AB-key: the edit is copied here (Enter / Esc / leave this place)";
      session.places.push(cm.setBookmark(cm.posFromIndex(offset), { widget }));
    }

    const insideEdited = (from, to) => {
      const edited = rangeOf(cm, session.edited);
      return Boolean(edited) && from >= edited.from && to <= edited.to;
    };

    session.onBeforeChange = (_cm, change) => {
      if (session.ended) return;
      if (change.origin === "undo" || change.origin === "redo" || change.origin === "setValue") {
        session.ended = "drop";
      } else if (!insideEdited(cm.indexFromPos(change.from), cm.indexFromPos(change.to))) {
        session.ended = "apply";
      }
    };
    session.onChange = () => {
      if (sessions.get(cm) !== session || !session.ended) return;
      if (session.ended === "drop") stopReplace(cm);
      // An edit outside the place: copy what was typed so far once this edit's operation is done.
      else Promise.resolve().then(() => applyReplace(cm));
    };
    session.onCursorActivity = () => {
      if (sessions.get(cm) !== session || session.ended) return;
      const ranges = cm.listSelections();
      if (ranges.length === 1) {
        const head = cm.indexFromPos(ranges[0].head);
        const edited = rangeOf(cm, session.edited);
        if (edited && head > edited.to && head === cm.indexFromPos(ranges[0].anchor)) {
          absorbSpaces(cm, session, cm.getValue().slice(edited.to, head));
        }
      }
      const inside = ranges.length === 1 && insideEdited(
        Math.min(cm.indexFromPos(ranges[0].anchor), cm.indexFromPos(ranges[0].head)),
        Math.max(cm.indexFromPos(ranges[0].anchor), cm.indexFromPos(ranges[0].head))
      );
      if (!inside) applyReplace(cm);
    };
    session.onBlur = () => {
      if (session.blurTimer) clearTimeout(session.blurTimer);
      session.blurTimer = setTimeout(() => {
        session.blurTimer = null;
        if (sessions.get(cm) !== session) return;
        if (typeof cm.hasFocus === "function" && cm.hasFocus()) return;
        applyReplace(cm);
      }, BLUR_DELAY_MS);
    };

    sessions.set(cm, session);
    cm.setCursor(primaryPos);
    cm.on("beforeChange", session.onBeforeChange);
    cm.on("change", session.onChange);
    cm.on("cursorActivity", session.onCursorActivity);
    cm.on("blur", session.onBlur);
    return session;
  }

  /** Alt+Backspace: delete every match and start a session. Returns true when it acted. */
  function deleteAllMatches(cm) {
    const found = matchesOf(cm);
    if (!found || found.matches.length < 2) return false;
    const { matches, selection } = found;
    const selected = Math.max(0, matches.findIndex(([start]) => start === selection.start));
    const cursors = cursorsAfterDelete(matches);
    const primaryOffset = cursorsAfterDelete(matches.slice(0, selected + 1)).pop();
    const primaryIndex = Math.max(0, cursors.indexOf(primaryOffset));
    const run = () => {
      // Right to left, so earlier offsets stay valid; one operation = one undo step.
      for (let i = matches.length - 1; i >= 0; i -= 1) {
        const [start, end] = matches[i];
        cm.replaceRange("", cm.posFromIndex(start), cm.posFromIndex(end), "+delete");
      }
      startReplace(cm, cursors, primaryIndex);
    };
    if (typeof cm.operation === "function") cm.operation(run);
    else run();
    return true;
  }

  // --- Highlight -------------------------------------------------------------------------

  const highlights = new WeakMap(); // cm -> { overlay, chips: Element[] }
  const watched = new WeakSet();

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
    if (!isOn(MULTI_EDIT_ATTR) || sessions.has(cm)) return;
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

    // While a replace is pending, Enter and Esc copy the edit instead of applying / cancelling
    // the formula. With the hint list open they belong to the hints (pick / close).
    if (sessions.has(cm) && (event.key === "Enter" || event.key === "Escape") && noModifiers(event)) {
      if (hintsOpen(cm)) return;
      consume(event);
      applyReplace(cm);
      return;
    }
    // Abacum's other Enter bindings (Ctrl/Cmd/Shift+Enter) still run, after the copy.
    if (sessions.has(cm) && event.key === "Enter" && !hintsOpen(cm)) {
      applyReplace(cm);
      return;
    }

    if (!isOn(MULTI_EDIT_ATTR)) return;
    if (isAltBackspace(event) && deleteAllMatches(cm)) {
      clearHighlight(cm);
      consume(event);
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
    cursorsAfterDelete,
    deleteAllMatches,
    applyReplace,
    stopReplace,
    isPending: (cm) => sessions.has(cm),
    updateHighlight,
    WORD_DELETE_ATTR,
    MULTI_EDIT_ATTR
  };
})();
