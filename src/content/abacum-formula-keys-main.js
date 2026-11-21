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
//      (an overlay for plain text, a class on the widget for variable chips).
//    - Alt+Backspace with at least two matches deletes every match and starts linked editing:
//      one real cursor stays where the selection was, the other places show a ghost cursor, and
//      every edit at the real cursor is copied to them. Abacum's hints only work with a single
//      selection (show-hint refuses several), which is why this is not CodeMirror's native
//      multi-cursor. A picked hint becomes a chip only at the real cursor (Abacum marks chips in
//      its hint callback, not from text), so the chip marks are copied to the other places too.
//    - The copies are made in the same CodeMirror operation as the edit ("change" handlers run
//      before the operation ends), so one Ctrl+Z undoes the edit everywhere.
//    - Linked editing ends on Esc (hints open: Esc closes them first), undo / redo, an edit or a
//      cursor outside the edited place, or several selections.
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
  const LINKED_CLASS = "ab-key-linked";
  const GHOST_CLASS = "ab-key-ghost-cursor";
  const MIRROR_ORIGIN = "+ab-key-mirror";
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

  /** Chips: atomic marks with a widget, as [start, end) offsets plus the mark. */
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
      `.${LINKED_CLASS}{background:rgba(255,193,7,.22);border-radius:2px}` +
      `.${GHOST_CLASS}{display:inline-block;width:0;height:1.1em;vertical-align:text-bottom;` +
      `border-left:2px solid rgba(255,140,0,.95);margin-right:-2px;` +
      `animation:ab-key-ghost-blink 1.06s steps(1) infinite}` +
      `@keyframes ab-key-ghost-blink{50%{opacity:0}}`;
    document.head.appendChild(style);
  }

  // --- Linked editing ----------------------------------------------------------------------

  const sessions = new WeakMap(); // cm -> linked editing session

  const LINKED_MARK = { inclusiveLeft: true, inclusiveRight: true, clearWhenEmpty: false, className: LINKED_CLASS };

  function rangeOf(cm, marker) {
    const found = marker.find();
    if (!found || !found.from) return null;
    return { from: cm.indexFromPos(found.from), to: cm.indexFromPos(found.to) };
  }

  function stopLinked(cm) {
    const session = sessions.get(cm);
    if (!session) return;
    sessions.delete(cm);
    if (typeof cm.off === "function") {
      cm.off("beforeChange", session.onBeforeChange);
      cm.off("change", session.onChange);
      cm.off("cursorActivity", session.onCursorActivity);
    }
    for (const region of session.regions) {
      region.marker.clear();
      if (region.ghost) region.ghost.clear();
      for (const chip of region.chips) chip.clear();
    }
  }

  /** Ghost cursor at the end of each mirror region (they are not real selections). */
  function placeGhosts(cm, session) {
    if (typeof cm.setBookmark !== "function") return;
    for (const region of session.regions) {
      if (region === session.primary) continue;
      if (region.ghost) region.ghost.clear();
      region.ghost = null;
      const range = rangeOf(cm, region.marker);
      if (!range) continue;
      const widget = document.createElement("span");
      widget.className = GHOST_CLASS;
      region.ghost = cm.setBookmark(cm.posFromIndex(range.to), { widget, insertLeft: true });
    }
  }

  /** Copies the primary region's chips (Abacum's atomic widgets) into every mirror region. */
  function syncChips(cm, session) {
    if (sessions.get(cm) !== session) return;
    const primary = rangeOf(cm, session.primary.marker);
    if (!primary) return;
    const chips = chipsOf(cm, primary.from, primary.to).filter((chip) => !session.ownChips.has(chip.mark));
    for (const region of session.regions) {
      if (region === session.primary) continue;
      for (const chip of region.chips) {
        session.ownChips.delete(chip);
        chip.clear();
      }
      region.chips = [];
      const range = rangeOf(cm, region.marker);
      if (!range) continue;
      for (const chip of chips) {
        const from = range.from + (chip.start - primary.from);
        const to = range.from + (chip.end - primary.from);
        if (to > range.to) continue;
        const original = chip.mark.replacedWith;
        const mark = cm.markText(cm.posFromIndex(from), cm.posFromIndex(to), {
          replacedWith: original && typeof original.cloneNode === "function" ? original.cloneNode(true) : undefined,
          atomic: true,
          handleMouseEvents: chip.mark.handleMouseEvents !== false
        });
        region.chips.push(mark);
        session.ownChips.add(mark);
      }
    }
  }

  /** Makes every mirror region hold the primary region's text. Runs inside the edit's operation. */
  function mirror(cm, session) {
    const primary = rangeOf(cm, session.primary.marker);
    if (!primary) {
      stopLinked(cm);
      return;
    }
    const value = cm.getValue();
    const text = value.slice(primary.from, primary.to);
    session.mirroring = true;
    try {
      for (const region of session.regions) {
        if (region === session.primary) continue;
        const range = rangeOf(cm, region.marker);
        if (!range) continue;
        if (cm.getValue().slice(range.from, range.to) === text) continue;
        cm.replaceRange(text, cm.posFromIndex(range.from), cm.posFromIndex(range.to), MIRROR_ORIGIN);
      }
    } finally {
      session.mirroring = false;
    }
    placeGhosts(cm, session);
    // Abacum marks a picked hint as a chip after its own replaceRange returns, i.e. after this
    // handler; copy chips once it has.
    Promise.resolve().then(() => syncChips(cm, session));
  }

  /**
   * Extends every region over the spaces that follow it, when each region is followed by exactly
   * these spaces. Returns false (nothing changed) otherwise.
   */
  function extendOverSpaces(cm, session, gap) {
    if (!/^[ \t]+$/.test(gap)) return false;
    const value = cm.getValue();
    const ranges = session.regions.map((region) => rangeOf(cm, region.marker));
    if (ranges.some((range) => !range || value.slice(range.to, range.to + gap.length) !== gap)) return false;
    session.regions.forEach((region, i) => {
      region.marker.clear();
      region.marker = cm.markText(
        cm.posFromIndex(ranges[i].from),
        cm.posFromIndex(ranges[i].to + gap.length),
        LINKED_MARK
      );
    });
    placeGhosts(cm, session);
    return true;
  }

  /** Starts linked editing at the cursor offsets; the cursor at primaryIndex stays real. */
  function startLinked(cm, cursors, primaryIndex) {
    stopLinked(cm);
    ensureStyle();
    const session = { regions: [], primary: null, mirroring: false, ownChips: new Set() };
    for (const offset of cursors) {
      const pos = cm.posFromIndex(offset);
      session.regions.push({ marker: cm.markText(pos, pos, LINKED_MARK), ghost: null, chips: [] });
    }
    session.primary = session.regions[primaryIndex] || session.regions[0];

    session.onBeforeChange = (_cm, change) => {
      if (session.mirroring) return;
      if (change.origin === "undo" || change.origin === "redo" || change.origin === "setValue") return;
      const primary = rangeOf(cm, session.primary.marker);
      const from = cm.indexFromPos(change.from);
      const to = cm.indexFromPos(change.to);
      // An edit reaching outside the linked place ends linked editing; the edit itself goes ahead.
      if (!primary || from < primary.from || to > primary.to) session.outside = true;
    };
    session.onChange = (_cm, change) => {
      if (session.mirroring || sessions.get(cm) !== session) return;
      const ends = change.origin === "undo" || change.origin === "redo" || change.origin === "setValue";
      if (ends || session.outside) {
        stopLinked(cm);
        return;
      }
      mirror(cm, session);
    };
    session.onCursorActivity = () => {
      if (session.mirroring || sessions.get(cm) !== session) return;
      const ranges = cm.listSelections();
      // Abacum inserts an operator hint as " -" and then steps over the space that follows:
      // spaces between the place and the cursor join the place (and every copy).
      if (ranges.length === 1) {
        const head = cm.indexFromPos(ranges[0].head);
        const current = rangeOf(cm, session.primary.marker);
        if (current && head > current.to && head === cm.indexFromPos(ranges[0].anchor)) {
          extendOverSpaces(cm, session, cm.getValue().slice(current.to, head));
        }
      }
      const primary = rangeOf(cm, session.primary.marker);
      const inside = (pos) => {
        const at = cm.indexFromPos(pos);
        return primary && at >= primary.from && at <= primary.to;
      };
      if (ranges.length !== 1 || !inside(ranges[0].head) || !inside(ranges[0].anchor)) stopLinked(cm);
    };

    sessions.set(cm, session);
    cm.setCursor(cm.posFromIndex(cursors[primaryIndex] ?? cursors[0]));
    cm.on("beforeChange", session.onBeforeChange);
    cm.on("change", session.onChange);
    cm.on("cursorActivity", session.onCursorActivity);
    placeGhosts(cm, session);
    return session;
  }

  /** Alt+Backspace: delete every match and link the places. Returns true when it acted. */
  function deleteAllMatches(cm) {
    const found = matchesOf(cm);
    if (!found || found.matches.length < 2) return false;
    const { matches, selection } = found;
    const selected = Math.max(0, matches.findIndex(([start]) => start === selection.start));
    const cursors = cursorsAfterDelete(matches);
    // Index of the selected match among the merged cursors.
    const primaryOffset = cursorsAfterDelete(matches.slice(0, selected + 1)).pop();
    const primaryIndex = Math.max(0, cursors.indexOf(primaryOffset));
    const run = () => {
      // Right to left, so earlier offsets stay valid; one operation = one undo step.
      for (let i = matches.length - 1; i >= 0; i -= 1) {
        const [start, end] = matches[i];
        cm.replaceRange("", cm.posFromIndex(start), cm.posFromIndex(end), "+delete");
      }
      startLinked(cm, cursors, primaryIndex);
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

    if (isPlainEscape(event) && sessions.has(cm)) {
      // Hints open: let Esc close them first; the next Esc ends linked editing.
      if (cm.state && cm.state.completionActive) return;
      consume(event);
      stopLinked(cm);
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
    stopLinked,
    isLinked: (cm) => sessions.has(cm),
    updateHighlight,
    WORD_DELETE_ATTR,
    MULTI_EDIT_ATTR
  };
})();
