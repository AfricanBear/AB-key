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

function loadMain({ enabled = true } = {}) {
  const html = fakeHtml();
  if (enabled) html.setAttribute(ATTR, "on");
  const listeners = [];
  const ctx = {
    document: { documentElement: html },
    window: { addEventListener: (type, fn, capture) => listeners.push({ type, fn, capture }) }
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(MAIN_SCRIPT, ctx, { filename: "abacum-formula-keys-main.js" });
  return {
    html,
    listeners,
    main: ctx.AbKeyFormulaKeysMain,
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
