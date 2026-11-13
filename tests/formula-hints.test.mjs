// Formula autocomplete beside the Cell Editor (abacum-formula-hints.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { sleep } from "./helpers.mjs";

const SCRIPT_PATH = "src/content/abacum-formula-hints.js";
const SCRIPT = fs.existsSync(new URL(`../${SCRIPT_PATH}`, import.meta.url))
  ? fs.readFileSync(new URL(`../${SCRIPT_PATH}`, import.meta.url), "utf8")
  : "";
const manifest = JSON.parse(fs.readFileSync(new URL("../manifest.json", import.meta.url), "utf8"));

// Sizes measured live (Nov 2026): editor 540x290, variable hints 310x300.
const EDITOR_RECT = { left: 413, top: 504, right: 953, bottom: 794, width: 540, height: 290 };
const LIST_SIZE = { width: 310, height: 300 };

function rect({ left, top, width, height }) {
  return { left, top, width, height, right: left + width, bottom: top + height };
}

function createEnv({ viewport = { width: 1562, height: 1104 }, editorRect = EDITOR_RECT } = {}) {
  const observers = [];
  const listeners = new Map(); // "target:type" -> [fn]
  const bodyChildren = [];

  const editor = { isConnected: true, getBoundingClientRect: () => editorRect };
  const input = {
    closest: (selector) => {
      if (selector === "[data-testid='testid-codemirror']") return input;
      if (selector === ".ag-popup-editor") return editor;
      return null;
    }
  };
  const elsewhere = { closest: () => null }; // e.g. the grid or the AI prompt input

  const on = (target) => ({
    addEventListener(type, fn) {
      const key = `${target}:${type}`;
      listeners.set(key, [...(listeners.get(key) || []), fn]);
    },
    removeEventListener(type, fn) {
      const key = `${target}:${type}`;
      listeners.set(key, (listeners.get(key) || []).filter((f) => f !== fn));
    }
  });

  const body = { tag: "BODY" };
  const document = {
    ...on("document"),
    body,
    activeElement: body,
    querySelector: (selector) =>
      selector === "ul.CodeMirror-hints" ? bodyChildren.find((n) => n.isHints && n.isConnected) || null : null
  };
  const window = { ...on("window"), innerWidth: viewport.width, innerHeight: viewport.height };

  class FakeObserver {
    constructor(callback) {
      this.callback = callback;
      this.active = false;
      observers.push(this);
    }
    observe(target, options) {
      this.target = target;
      this.options = options;
      this.active = true;
    }
    disconnect() {
      this.active = false;
    }
  }

  const ctx = { Math, setTimeout, clearTimeout, MutationObserver: FakeObserver, document, window };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(SCRIPT, ctx, { filename: SCRIPT_PATH });

  const fire = (key, event = {}) => (listeners.get(key) || []).forEach((fn) => fn(event));
  const active = () => observers.filter((o) => o.active);
  const notify = (target) => active().filter((o) => o.target === target).forEach((o) => o.callback([]));

  /** CodeMirror appends a new hint list at the caret (as it does on every keystroke). */
  function showHints({ left = 645, top = 363, size = LIST_SIZE } = {}) {
    for (const old of bodyChildren) old.isConnected = false;
    const list = {
      isHints: true,
      isConnected: true,
      style: { left: `${left}px`, top: `${top}px` },
      getBoundingClientRect() {
        return rect({ left: parseFloat(this.style.left), top: parseFloat(this.style.top), ...size });
      }
    };
    bodyChildren.push(list);
    notify(body);
    return list;
  }

  return {
    ctx,
    editor,
    input,
    elsewhere,
    observers,
    active,
    listeners,
    showHints,
    notify,
    focus(node) {
      document.activeElement = node;
      fire("document:focusin", { target: node });
    },
    async blur(next = body) {
      document.activeElement = next;
      fire("document:focusout", {});
      await sleep(5);
    },
    count: (key) => (listeners.get(key) || []).length
  };
}

test("manifest loads the script on Abacum", () => {
  const entry = manifest.content_scripts.find((e) => e.js.includes(SCRIPT_PATH));
  assert.ok(entry, "content script registered");
  assert.deepEqual(entry.matches, ["*://*.abacum.io/*"]);
});

test("placeBeside: right of the editor, top-aligned", () => {
  const env = createEnv();
  const place = env.ctx.AbKeyFormulaHints.placeBeside(EDITOR_RECT, LIST_SIZE, { width: 1562, height: 1104 });
  assert.deepEqual({ ...place }, { left: 961, top: 504 });
});

test("placeBeside: left of the editor when the right side has no room", () => {
  const env = createEnv();
  const box = rect({ left: 900, top: 200, width: 540, height: 290 }); // right edge 1440
  const place = env.ctx.AbKeyFormulaHints.placeBeside(box, LIST_SIZE, { width: 1562, height: 1104 });
  assert.deepEqual({ ...place }, { left: 900 - 8 - 310, top: 200 });
});

test("placeBeside: null when neither side fits", () => {
  const env = createEnv();
  const box = rect({ left: 100, top: 200, width: 540, height: 290 });
  assert.equal(env.ctx.AbKeyFormulaHints.placeBeside(box, LIST_SIZE, { width: 700, height: 1104 }), null);
});

test("placeBeside: keeps the list inside the viewport bottom", () => {
  const env = createEnv();
  const box = rect({ left: 413, top: 900, width: 540, height: 190 });
  const place = env.ctx.AbKeyFormulaHints.placeBeside(box, LIST_SIZE, { width: 1562, height: 1104 });
  assert.equal(place.top, 1104 - 300 - 8);
});

test("moves each new hint list beside the open formula editor", () => {
  const env = createEnv();
  env.focus(env.input);
  const first = env.showHints();
  assert.deepEqual([first.style.left, first.style.top], ["961px", "504px"]);
  const second = env.showHints({ left: 700, top: 400 }); // next keystroke: a fresh list
  assert.deepEqual([second.style.left, second.style.top], ["961px", "504px"]);
});

test("positions a list that is already open when the editor gets focus", () => {
  const env = createEnv();
  const list = env.showHints(); // Operators list shows up together with the editor
  assert.equal(list.style.left, "645px", "not touched before focus");
  env.focus(env.input);
  assert.deepEqual([list.style.left, list.style.top], ["961px", "504px"]);
});

test("re-applies the position when CodeMirror rewrites it, without a loop", () => {
  const env = createEnv();
  env.focus(env.input);
  const list = env.showHints();
  const styleObserver = env.active().find((o) => o.target === list);
  assert.ok(styleObserver, "watches the list style");
  assert.equal(JSON.stringify(styleObserver.options), JSON.stringify({ attributes: true, attributeFilter: ["style"] }));

  list.style.top = "150px"; // CodeMirror's onScroll
  env.notify(list);
  assert.equal(list.style.top, "504px");

  let writes = 0;
  const style = list.style;
  list.style = new Proxy(style, { set: (t, k, v) => ((writes += 1), (t[k] = v), true) });
  env.notify(list); // our own write echoed back
  assert.equal(writes, 0, "same values are not written again");
});

test("leaves hint lists alone outside the formula editor", () => {
  const env = createEnv();
  env.focus(env.elsewhere);
  assert.equal(env.active().length, 0, "no observer");
  const list = env.showHints();
  assert.equal(list.style.left, "645px");
});

test("does no work while idle: observers and listeners stop on focusout", async () => {
  const env = createEnv();
  assert.equal(env.observers.length, 0, "nothing observed before a formula editor has focus");

  env.focus(env.input);
  env.showHints();
  const bodyObserver = env.active().find((o) => o.target?.tag === "BODY");
  assert.ok(bodyObserver);
  assert.equal(JSON.stringify(bodyObserver.options), JSON.stringify({ childList: true }), "no subtree");
  assert.equal(env.count("window:resize"), 1);

  env.editor.isConnected = false; // Cancel / Apply closes the editor
  await env.blur();
  assert.equal(env.active().length, 0, "all observers disconnected");
  assert.equal(env.count("window:resize"), 0);
  assert.equal(env.count("document:scroll"), 0);
  assert.equal(env.ctx.AbKeyFormulaHints.isActive(), false);

  const list = env.showHints();
  assert.equal(list.style.left, "645px", "later lists untouched");
});

test("stays active when focus returns to the input (click on a hint)", async () => {
  const env = createEnv();
  env.focus(env.input);
  await env.blur(env.input); // focus already back in CodeMirror when the check runs
  assert.equal(env.ctx.AbKeyFormulaHints.isActive(), true);
});
