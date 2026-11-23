import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createDefaultConfig, migrateConfig } from "../src/shared/config-schema.js";
import { CONFIG_KEY, loadV1Config, sleep } from "./helpers.mjs";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const MAIN_SCRIPT = read("src/content/abacum-model-dimensions-main.js");
const ISOLATED_SCRIPT = read("src/content/abacum-model-dimensions.js");
const manifest = JSON.parse(read("manifest.json"));
const ATTR = "data-ab-key-model-dims";
const VISIBLE_KEY = "abKey.modelDimensionsVisible";
const plain = (value) => JSON.parse(JSON.stringify(value));

function fakeHtml() {
  const attrs = {};
  return {
    attrs,
    getAttribute: (name) => (name in attrs ? attrs[name] : null),
    setAttribute: (name, value) => (attrs[name] = String(value)),
    removeAttribute: (name) => delete attrs[name]
  };
}

/** Page-world script on a page with no grid: only its pure helpers are used. */
function loadMain() {
  const html = fakeHtml();
  const ctx = {
    document: {
      documentElement: html,
      body: {},
      head: null,
      querySelector: () => null,
      querySelectorAll: () => [],
      getElementById: () => null
    },
    location: { pathname: "/app/library" },
    MutationObserver: class {
      observe() {}
    },
    requestAnimationFrame: () => 0
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(MAIN_SCRIPT, ctx, { filename: "abacum-model-dimensions-main.js" });
  return ctx.AbKeyModelDimensionsMain;
}

async function loadIsolated(stored) {
  const html = fakeHtml();
  const listeners = {};
  let onChanged = null;
  const writes = [];
  const ctx = {
    Promise,
    chrome: {
      storage: {
        local: {
          get: async () => ({ ...stored }),
          set: async (value) => {
            writes.push(value);
          }
        },
        onChanged: { addListener: (fn) => (onChanged = fn) }
      }
    },
    document: {
      documentElement: html,
      addEventListener: (type, fn) => (listeners[type] = fn)
    }
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(ISOLATED_SCRIPT, ctx, { filename: "abacum-model-dimensions.js" });
  await sleep(10);
  return {
    state: () => html.getAttribute(ATTR),
    toggle: () => listeners["ab-key:model-dims-toggle"]({}),
    change: (changes) => onChanged(changes, "local"),
    writes
  };
}

test("chips: first three names, then +N with the full list in the title; empty is marked", () => {
  const { chipModel } = loadMain();
  assert.deepEqual(plain(chipModel(["a", "b"])), { shown: ["a", "b"], more: 0, title: "a, b", empty: false });
  assert.deepEqual(plain(chipModel(["a", "b", "c", "d", "e"])), {
    shown: ["a", "b", "c"],
    more: 2,
    title: "a, b, c, d, e",
    empty: false
  });
  assert.deepEqual(plain(chipModel([])), { shown: [], more: 0, title: "", empty: true });
  assert.equal(chipModel(undefined).empty, true);
  assert.deepEqual(plain(chipModel(["a", "", null, "b"]).shown), ["a", "b"], "junk entries skipped");
});

test("row height: only variable rows get the extra room, on top of Abacum's current height", () => {
  const { rowHeightFor, EXTRA_PX } = loadMain();
  let base = 32;
  const height = rowHeightFor(() => base);
  assert.equal(height({ data: { dimensions: ["a"] } }), 32 + EXTRA_PX);
  assert.equal(height({ data: { dimensions: [] } }), 32 + EXTRA_PX, "no dimensions still shows the note");
  assert.equal(height({ data: { name: "group" } }), undefined, "group / dimension rows keep the default");
  assert.equal(height({}), undefined);
  base = 24; // density changed in Abacum
  assert.equal(height({ data: { dimensions: [] } }), 24 + EXTRA_PX);
});

test("settings: hidden by default, toggle shows it everywhere and is stored once for all models", async () => {
  const page = await loadIsolated({ [CONFIG_KEY]: createDefaultConfig() });
  assert.equal(page.state(), "hidden");
  page.toggle();
  assert.equal(page.state(), "shown", "applies at once");
  assert.deepEqual(plain(page.writes), [{ [VISIBLE_KEY]: true }]);
  page.toggle();
  assert.equal(page.state(), "hidden");
  page.change({ [VISIBLE_KEY]: { newValue: true } });
  assert.equal(page.state(), "shown", "another tab flipped it");

  const stored = await loadIsolated({ [CONFIG_KEY]: createDefaultConfig(), [VISIBLE_KEY]: true });
  assert.equal(stored.state(), "shown");
});

test("settings: feature off removes the attribute and ignores the button", async () => {
  const off = await loadIsolated({ [CONFIG_KEY]: { ...createDefaultConfig(), modelDimensionsEnabled: false }, [VISIBLE_KEY]: true });
  assert.equal(off.state(), null);
  off.toggle();
  assert.equal(off.state(), null);
  assert.deepEqual(plain(off.writes), []);
  off.change({ [CONFIG_KEY]: { newValue: createDefaultConfig() } });
  assert.equal(off.state(), "shown", "turning it back on restores the stored switch");
  assert.equal((await loadIsolated({ [CONFIG_KEY]: loadV1Config() })).state(), "hidden", "not migrated yet counts as on");
});

test("config: on by default, kept when the user turns it off, added to old configs", () => {
  assert.equal(createDefaultConfig().modelDimensionsEnabled, true);
  assert.equal(migrateConfig(loadV1Config()).modelDimensionsEnabled, true);
  assert.equal(migrateConfig({ ...createDefaultConfig(), modelDimensionsEnabled: false }).modelDimensionsEnabled, false);
  // Toggle id = config flag; the generic wiring is tested in options-groups / options-ux.
  assert.match(read("src/options/options.html"), /id="modelDimensionsEnabled"/);
});

test("manifest: page-world part in MAIN without chrome.*, settings part isolated, Abacum only", () => {
  const main = manifest.content_scripts.find((item) => item.js.includes("src/content/abacum-model-dimensions-main.js"));
  assert.equal(main.world, "MAIN");
  assert.deepEqual(main.matches, ["*://*.abacum.io/*"]);
  assert.doesNotMatch(MAIN_SCRIPT.replace(/^\s*\/\/.*$/gm, ""), /chrome\./);
  const isolated = manifest.content_scripts.find((item) => item.js.includes("src/content/abacum-model-dimensions.js"));
  assert.equal(isolated.world, undefined);
  assert.deepEqual(isolated.matches, ["*://*.abacum.io/*"]);
});

test("page-world script: the button is cloned from Show Builder Values and only on model pages", () => {
  assert.match(MAIN_SCRIPT, /button\[aria-label="Show Builder Values"\]/);
  assert.match(MAIN_SCRIPT, /toolbar-rail-button-module-dimensions/);
  assert.match(MAIN_SCRIPT, /\^\\\/app\\\/modules/);
});
