import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createDefaultConfig, migrateConfig } from "../src/shared/config-schema.js";
import { CONFIG_KEY, loadV1Config, sleep } from "./helpers.mjs";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const MAIN_SCRIPT = read("src/content/abacum-formula-keys-main.js");
const ISOLATED_SCRIPT = read("src/content/abacum-formula-keys.js");
const manifest = JSON.parse(read("manifest.json"));
const ATTR = "data-ab-key-word-delete";
const MULTI_ATTR = "data-ab-key-multi-edit";

function fakeHtml() {
  const attrs = {};
  return {
    attrs,
    getAttribute: (name) => (name in attrs ? attrs[name] : null),
    setAttribute: (name, value) => (attrs[name] = String(value)),
    removeAttribute: (name) => delete attrs[name]
  };
}

/** A fake CodeMirror input: textarea -> .CodeMirror (with .CodeMirror instance) -> editor host. */
function fakeEditor({ insideFormulaEditor = true, readOnly = false } = {}) {
  const commands = [];
  // Abacum's own binding: Ctrl-Backspace clears the formula. It runs only if our listener lets
  // the event through to CodeMirror.
  const cm = { execCommand: (name) => commands.push(name), isReadOnly: () => readOnly };
  const editorHost = { testid: "testid-codemirror" };
  const cmHost = {
    CodeMirror: cm,
    closest: (selector) => (selector.includes("testid-codemirror") && insideFormulaEditor ? editorHost : null)
  };
  const input = { closest: (selector) => (selector === ".CodeMirror" ? cmHost : null) };
  return { cm, input, commands };
}

function fakeHead() {
  const nodes = [];
  return {
    nodes,
    appendChild: (node) => nodes.push(node),
    byId: (id) => nodes.find((node) => node.id === id) || null
  };
}

function loadMain({ enabled = true, multiEdit = true } = {}) {
  const html = fakeHtml();
  if (enabled) html.setAttribute(ATTR, "on");
  if (multiEdit) html.setAttribute(MULTI_ATTR, "on");
  const listeners = [];
  const head = fakeHead();
  const ctx = {
    document: {
      documentElement: html,
      head,
      getElementById: (id) => head.byId(id),
      createElement: () => ({ id: "", textContent: "" })
    },
    window: { addEventListener: (type, fn, capture) => listeners.push({ type, fn, capture }) }
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(MAIN_SCRIPT, ctx, { filename: "abacum-formula-keys-main.js" });
  return {
    html,
    listeners,
    head,
    main: ctx.AbKeyFormulaKeysMain,
    focus(target) {
      for (const listener of listeners) if (listener.type === "focusin") listener.fn({ target });
    },
    /** Dispatches a keydown at target; returns what happened to the event. */
    press(target, init) {
      const event = {
        key: "Backspace",
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        shiftKey: false,
        isComposing: false,
        target,
        prevented: false,
        stopped: false,
        ...init,
        preventDefault() {
          this.prevented = true;
        },
        stopImmediatePropagation() {
          this.stopped = true;
        }
      };
      for (const listener of listeners) if (listener.type === "keydown") listener.fn(event);
      return event;
    }
  };
}

async function loadIsolated(config) {
  const html = fakeHtml();
  let onChanged = null;
  const ctx = {
    Promise,
    chrome: {
      storage: {
        local: { get: async () => ({ [CONFIG_KEY]: config }) },
        onChanged: { addListener: (fn) => (onChanged = fn) }
      }
    },
    document: { documentElement: html }
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(ISOLATED_SCRIPT, ctx, { filename: "abacum-formula-keys.js" });
  await sleep(10);
  return {
    value: () => html.getAttribute(ATTR),
    multi: () => html.getAttribute(MULTI_ATTR),
    change: (newValue) => onChanged({ [CONFIG_KEY]: { newValue } }, "local")
  };
}

test("setting: on by default, kept when the user turns it off, added to old configs", () => {
  assert.equal(createDefaultConfig().formulaWordDeleteEnabled, true);
  assert.equal(migrateConfig(loadV1Config()).formulaWordDeleteEnabled, true);
  const off = migrateConfig({ ...createDefaultConfig(), formulaWordDeleteEnabled: false });
  assert.equal(off.formulaWordDeleteEnabled, false);
});

test("Ctrl+Backspace in the formula editor deletes the previous word, not the whole formula", () => {
  const page = loadMain();
  const editor = fakeEditor();
  const event = page.press(editor.input, { ctrlKey: true });
  assert.deepEqual(editor.commands, ["delGroupBefore"]);
  assert.ok(event.prevented && event.stopped, "Abacum's clear-all binding never sees the key");
  assert.ok(page.listeners.every((listener) => listener.capture === true), "runs before CodeMirror");
});

test("Cmd+Backspace (Mac) deletes to the start of the line", () => {
  const page = loadMain();
  const editor = fakeEditor();
  page.press(editor.input, { metaKey: true });
  assert.deepEqual(editor.commands, ["delWrappedLineLeft"]);
});

test("other keys and other editors are left alone", () => {
  const page = loadMain();
  const editor = fakeEditor();
  const cases = [
    {},
    { ctrlKey: true, shiftKey: true },
    { ctrlKey: true, altKey: true },
    { ctrlKey: true, metaKey: true },
    { ctrlKey: true, isComposing: true },
    { ctrlKey: true, key: "Delete" },
    { ctrlKey: true, key: "a" }
  ];
  for (const init of cases) {
    const event = page.press(editor.input, init);
    assert.equal(event.prevented, false, JSON.stringify(init));
  }
  assert.deepEqual(editor.commands, []);

  const other = fakeEditor({ insideFormulaEditor: false });
  assert.equal(page.press(other.input, { ctrlKey: true }).prevented, false, "CodeMirror outside the formula editor");
  assert.equal(page.press({ closest: () => null }, { ctrlKey: true }).prevented, false, "a plain input");
  assert.equal(page.press(null, { ctrlKey: true }).prevented, false);

  const readOnly = fakeEditor({ readOnly: true });
  assert.equal(page.press(readOnly.input, { ctrlKey: true }).prevented, false, "read-only editor");
  assert.deepEqual(readOnly.commands, []);
});

test("turned off: Abacum's own behaviour is untouched", () => {
  const page = loadMain({ enabled: false });
  const editor = fakeEditor();
  assert.equal(page.press(editor.input, { ctrlKey: true }).prevented, false);
  assert.deepEqual(editor.commands, []);
  page.html.setAttribute(ATTR, "on");
  assert.equal(page.press(editor.input, { ctrlKey: true }).prevented, true, "applies without reload");
});

test("settings script mirrors the option into the <html> attribute and follows changes", async () => {
  const page = await loadIsolated(createDefaultConfig());
  assert.equal(page.value(), "on");
  page.change({ ...createDefaultConfig(), formulaWordDeleteEnabled: false });
  assert.equal(page.value(), null);
  page.change({ ...createDefaultConfig(), formulaWordDeleteEnabled: true });
  assert.equal(page.value(), "on");
  assert.equal((await loadIsolated(loadV1Config())).value(), "on", "not migrated yet counts as on");
  assert.equal((await loadIsolated({ ...createDefaultConfig(), formulaWordDeleteEnabled: false })).value(), null);
});

test("manifest: page-world part in MAIN without chrome.*, settings part isolated, Abacum only", () => {
  const main = manifest.content_scripts.find((item) => item.js.includes("src/content/abacum-formula-keys-main.js"));
  assert.equal(main.world, "MAIN");
  assert.deepEqual(main.matches, ["*://*.abacum.io/*"]);
  assert.doesNotMatch(MAIN_SCRIPT.replace(/^\s*\/\/.*$/gm, ""), /chrome\./);
  const isolated = manifest.content_scripts.find((item) => item.js.includes("src/content/abacum-formula-keys.js"));
  assert.equal(isolated.world, undefined);
  assert.deepEqual(isolated.matches, ["*://*.abacum.io/*"]);
});

test("options page has the toggle and saves it", () => {
  assert.match(read("src/options/options.html"), /id="formulaWordDeleteEnabled"/);
  const js = read("src/options/options.js");
  assert.match(js, /parsed\.formulaWordDeleteEnabled = formulaWordDeleteToggle\.checked/);
  assert.match(js, /formulaWordDeleteToggle\.checked = config\.formulaWordDeleteEnabled !== false/);
});

// --- Edit all matches (Alt+Backspace) -------------------------------------------------------

function fakeClassList() {
  const set = new Set();
  return { add: (c) => set.add(c), remove: (c) => set.delete(c), contains: (c) => set.has(c) };
}

/**
 * A small CodeMirror stand-in with a real text model: offsets <-> {line, ch}, several
 * selections, replaceSelection, atomic marks (chips) with widgets, overlays and events.
 * chips: substrings of text that are atomic marks (every occurrence).
 */
function fakeCodeMirror(text, { chips = [] } = {}) {
  let value = text;
  let ranges = [{ anchor: 0, head: 0 }];
  let primary = 0;
  const handlers = {};
  const overlays = [];
  const commands = [];
  const marks = [];
  const cm = {
    state: {},
    commands,
    overlays,
    marks,
    getValue: () => value,
    indexFromPos({ line, ch }) {
      const lines = value.split("\n");
      let index = 0;
      for (let i = 0; i < line; i += 1) index += lines[i].length + 1;
      return index + ch;
    },
    posFromIndex(index) {
      const before = value.slice(0, index).split("\n");
      return { line: before.length - 1, ch: before[before.length - 1].length };
    },
    listSelections: () => ranges.map((r) => ({ anchor: cm.posFromIndex(r.anchor), head: cm.posFromIndex(r.head) })),
    setSelections(next, nextPrimary = 0) {
      ranges = next.map((r) => ({ anchor: cm.indexFromPos(r.anchor), head: cm.indexFromPos(r.head) }));
      primary = nextPrimary;
      handlers.cursorActivity?.forEach((fn) => fn());
    },
    select(start, end) {
      cm.setSelections([{ anchor: cm.posFromIndex(start), head: cm.posFromIndex(end) }]);
    },
    primary: () => primary,
    cursors: () => ranges.map((r) => r.head),
    replaceSelection(insert) {
      const sorted = ranges
        .map((r) => [Math.min(r.anchor, r.head), Math.max(r.anchor, r.head)])
        .sort((a, b) => b[0] - a[0]);
      for (const [start, end] of sorted) value = value.slice(0, start) + insert + value.slice(end);
      // Cursors after the edit, left to right.
      let shift = 0;
      ranges = sorted.reverse().map(([start, end]) => {
        const at = start + shift + insert.length;
        shift += insert.length - (end - start);
        return { anchor: at, head: at };
      });
    },
    operation: (fn) => fn(),
    getAllMarks: () => marks,
    execCommand(name) {
      commands.push(name);
      if (name === "singleSelection") ranges = [ranges[primary]];
    },
    isReadOnly: () => false,
    addOverlay: (overlay) => overlays.push(overlay),
    removeOverlay: (overlay) => overlays.splice(overlays.indexOf(overlay), 1),
    on: (type, fn) => (handlers[type] ||= []).push(fn),
    emit: (type) => handlers[type]?.forEach((fn) => fn())
  };
  for (const chip of chips) {
    for (let at = value.indexOf(chip); at >= 0; at = value.indexOf(chip, at + chip.length)) {
      const mark = { atomic: true, start: at, end: at + chip.length, replacedWith: { classList: fakeClassList() } };
      mark.find = () => ({ from: cm.posFromIndex(mark.start), to: cm.posFromIndex(mark.end) });
      marks.push(mark);
    }
  }
  const editorHost = { testid: "testid-codemirror" };
  const cmHost = { CodeMirror: cm, closest: (selector) => (selector.includes("testid-codemirror") ? editorHost : null) };
  const input = { closest: (selector) => (selector === ".CodeMirror" ? cmHost : null) };
  return { cm, input };
}

/** Ranges an overlay marks: runs the overlay's token() over one line like CodeMirror does. */
function overlayHits(overlay, line) {
  const hits = [];
  let pos = 0;
  const stream = {
    match(pattern, consume = true) {
      if (!line.startsWith(pattern, pos)) return false;
      if (consume) pos += pattern.length;
      return true;
    },
    next() {
      if (pos >= line.length) return null;
      pos += 1;
      return line[pos - 1];
    }
  };
  while (pos < line.length) {
    const start = pos;
    const style = overlay.token(stream);
    if (style) hits.push([start, pos]);
  }
  return hits;
}

/** Arrays made inside the vm context have another Array prototype; compare them as plain data. */
const plain = (value) => JSON.parse(JSON.stringify(value));

test("findMatches: non-overlapping, left to right, skips matches that cut through a chip", () => {
  const main = loadMain().main;
  const findMatches = (...args) => plain(main.findMatches(...args));
  assert.deepEqual(findMatches("a + b + a", "a"), [
    [0, 1],
    [8, 9]
  ]);
  assert.deepEqual(findMatches("aaaa", "aa"), [
    [0, 2],
    [2, 4]
  ]);
  assert.deepEqual(findMatches("x", ""), []);
  assert.deepEqual(findMatches("a  b", "  "), [], "whitespace only");
  // Chip v{{Rev}} at 0..8: "Rev" inside it is not a match, the whole chip is.
  const text = "v{{Rev}} * Rev";
  const atomic = [[0, 8]];
  assert.deepEqual(findMatches(text, "Rev", atomic), [[11, 14]]);
  assert.deepEqual(findMatches(`${text} + v{{Rev}}`, "v{{Rev}}", [...atomic, [17, 25]]), [
    [0, 8],
    [17, 25]
  ]);
});

test("Alt+Backspace deletes every match and leaves a cursor at each; typing goes everywhere", () => {
  const page = loadMain();
  const { cm, input } = fakeCodeMirror("IF x > 0 THEN x * 2 ELSE x");
  cm.select(14, 15); // the second x
  const event = page.press(input, { altKey: true });
  assert.ok(event.prevented && event.stopped);
  assert.equal(cm.getValue(), "IF  > 0 THEN  * 2 ELSE ");
  assert.deepEqual(plain(cm.cursors()), [3, 13, 23]);
  assert.equal(cm.primary(), 1, "the selected occurrence stays the primary cursor");
  cm.replaceSelection("y1");
  assert.equal(cm.getValue(), "IF y1 > 0 THEN y1 * 2 ELSE y1");
});

test("Alt+Backspace replaces variable chips as a whole, on several lines", () => {
  const page = loadMain();
  const chip = "v{{Top-tier flag}}";
  const { cm, input } = fakeCodeMirror(`IF ${chip} = 1\nTHEN ${chip} * 2\nELSE 0`, { chips: [chip] });
  cm.select(3, 3 + chip.length);
  assert.equal(page.press(input, { altKey: true }).prevented, true);
  assert.equal(cm.getValue(), "IF  = 1\nTHEN  * 2\nELSE 0");
});

test("Alt+Backspace is left alone without two matches, without a selection, or when off", () => {
  const page = loadMain();
  const { cm, input } = fakeCodeMirror("a + b");
  cm.select(0, 1); // one match only
  assert.equal(page.press(input, { altKey: true }).prevented, false);
  cm.select(2, 2); // no selection
  assert.equal(page.press(input, { altKey: true }).prevented, false);
  assert.equal(cm.getValue(), "a + b");

  const twice = fakeCodeMirror("a + a");
  twice.cm.select(0, 1);
  const others = [
    { altKey: true, ctrlKey: true },
    { altKey: true, shiftKey: true },
    { altKey: true, metaKey: true },
    { altKey: true, key: "Delete" }
  ];
  for (const init of others) {
    assert.equal(page.press(twice.input, init).prevented, false, JSON.stringify(init));
  }
  assert.equal(twice.cm.getValue(), "a + a");

  const off = loadMain({ multiEdit: false });
  assert.equal(off.press(twice.input, { altKey: true }).prevented, false);
  assert.equal(twice.cm.getValue(), "a + a");
  off.html.setAttribute(MULTI_ATTR, "on");
  assert.equal(off.press(twice.input, { altKey: true }).prevented, true, "applies without reload");
});

test("Esc with several cursors goes back to one; otherwise Abacum's Esc (and hints) run", () => {
  const page = loadMain();
  const { cm, input } = fakeCodeMirror("a + a");
  cm.select(0, 1);
  page.press(input, { altKey: true });
  assert.equal(cm.cursors().length, 2);

  cm.state.completionActive = {};
  assert.equal(page.press(input, { key: "Escape" }).prevented, false, "hints open: they close first");
  delete cm.state.completionActive;

  const esc = page.press(input, { key: "Escape" });
  assert.ok(esc.prevented && esc.stopped, "the editor is not cancelled");
  assert.deepEqual(cm.commands, ["singleSelection"]);
  assert.equal(cm.cursors().length, 1);
  assert.equal(page.press(input, { key: "Escape" }).prevented, false, "one cursor: Abacum cancels as usual");
});

test("a selection highlights the other matches (text by overlay, chips by widget class)", () => {
  const page = loadMain();
  const chip = "v{{Rev}}";
  const { cm, input } = fakeCodeMirror(`${chip} + x * ${chip} + x`, { chips: [chip] });
  page.focus(input);

  cm.select(11, 12); // x
  assert.equal(cm.overlays.length, 1);
  assert.deepEqual(overlayHits(cm.overlays[0], cm.getValue()), [
    [11, 12],
    [26, 27]
  ]);
  assert.ok(page.head.byId("ab-key-formula-match-style"), "style added");

  cm.select(0, chip.length); // the chip
  assert.equal(cm.overlays.length, 1, "previous overlay removed");
  assert.ok(cm.marks.every((mark) => mark.replacedWith.classList.contains("ab-key-match-chip")));

  cm.select(4, 4); // cursor only
  assert.equal(cm.overlays.length, 0);
  assert.ok(cm.marks.every((mark) => !mark.replacedWith.classList.contains("ab-key-match-chip")));

  cm.select(11, 12);
  cm.emit("blur");
  assert.equal(cm.overlays.length, 0, "cleared on blur");

  page.html.removeAttribute(MULTI_ATTR);
  cm.select(11, 12);
  assert.equal(cm.overlays.length, 0, "off: no highlight");
  assert.equal(page.head.nodes.length, 1, "style added once");
});

test("multi-edit setting: on by default, kept when off, mirrored into <html>, on the Options page", async () => {
  assert.equal(createDefaultConfig().formulaMultiEditEnabled, true);
  assert.equal(migrateConfig(loadV1Config()).formulaMultiEditEnabled, true);
  assert.equal(migrateConfig({ ...createDefaultConfig(), formulaMultiEditEnabled: false }).formulaMultiEditEnabled, false);

  const page = await loadIsolated(createDefaultConfig());
  assert.equal(page.multi(), "on");
  page.change({ ...createDefaultConfig(), formulaMultiEditEnabled: false });
  assert.equal(page.multi(), null);
  assert.equal(page.value(), "on", "word delete stays on");
  assert.equal((await loadIsolated(loadV1Config())).multi(), "on", "not migrated yet counts as on");

  assert.match(read("src/options/options.html"), /id="formulaMultiEditEnabled"/);
  const js = read("src/options/options.js");
  assert.match(js, /parsed\.formulaMultiEditEnabled = formulaMultiEditToggle\.checked/);
  assert.match(js, /formulaMultiEditToggle\.checked = config\.formulaMultiEditEnabled !== false/);
});
