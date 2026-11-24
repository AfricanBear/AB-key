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

/** A tiny element: enough for the "+N" popup (children, dataset, style, rects). */
function fakeElement(tag, rect = { left: 0, top: 0, bottom: 0, width: 0, height: 0 }) {
  return {
    tag,
    className: "",
    textContent: "",
    dataset: {},
    style: {},
    attrs: {},
    children: [],
    parent: null,
    setAttribute(name, value) {
      this.attrs[name] = String(value);
    },
    appendChild(child) {
      child.parent = this;
      this.children.push(child);
      return child;
    },
    remove() {
      if (this.parent) this.parent.children = this.parent.children.filter((child) => child !== this);
      this.parent = null;
    },
    getBoundingClientRect: () => rect
  };
}

/** Page-world script on a page with no grid: only its pure helpers and the popup are used. */
function loadMain({ view = { width: 1000, height: 800 }, popupSize = { width: 120, height: 48 } } = {}) {
  const html = fakeHtml();
  html.clientWidth = view.width;
  html.clientHeight = view.height;
  const body = fakeElement("body");
  const listeners = {};
  const ctx = {
    document: {
      documentElement: html,
      body,
      head: null,
      querySelector: () => null,
      querySelectorAll: (selector) =>
        selector === ".ab-key-model-dims-popup" ? body.children.filter((el) => el.className === "ab-key-model-dims-popup") : [],
      getElementById: () => null,
      createElement: (tag) => fakeElement(tag, { left: 0, top: 0, bottom: popupSize.height, ...popupSize }),
      addEventListener: (type, fn) => (listeners[type] = fn)
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
  return Object.assign(Object.create(ctx.AbKeyModelDimensionsMain), { body, listeners });
}

/** A "+N" chip at rect whose closest() finds itself, as inside the chips box. */
function moreChip(names, rect) {
  const chip = fakeElement("span", rect);
  chip.dataset.names = JSON.stringify(names);
  chip.closest = (selector) => (selector === ".ab-key-model-dims .ab-key-more" ? chip : null);
  return chip;
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

test("chips: first three names, then +N hiding the rest; empty is marked", () => {
  const { chipModel } = loadMain();
  assert.deepEqual(plain(chipModel(["a", "b"])), { shown: ["a", "b"], hidden: [], more: 0, empty: false });
  assert.deepEqual(plain(chipModel(["a", "b", "c", "d", "e"])), {
    shown: ["a", "b", "c"],
    hidden: ["d", "e"],
    more: 2,
    empty: false
  });
  assert.deepEqual(plain(chipModel([])), { shown: [], hidden: [], more: 0, empty: true });
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

test("+N popup: hovering the chip lists the hidden dimensions under it, leaving removes it", () => {
  const page = loadMain();
  const chip = moreChip(["Region", "Product line"], { left: 300, top: 100, bottom: 116, width: 20, height: 16 });
  page.listeners.mouseover({ target: chip, relatedTarget: null });
  const popups = page.body.children;
  assert.equal(popups.length, 1);
  assert.equal(popups[0].attrs.role, "tooltip");
  assert.deepEqual(popups[0].children.map((line) => line.textContent), ["Region", "Product line"]);
  assert.deepEqual(plain(popups[0].style), { top: "120px", left: "300px" });

  page.listeners.mouseover({ target: chip, relatedTarget: chip }); // moving inside the chip
  assert.equal(page.body.children.length, 1, "no second popup");
  page.listeners.mouseout({ target: chip, relatedTarget: null });
  assert.equal(page.body.children.length, 0);

  page.listeners.mouseover({ target: chip, relatedTarget: null });
  page.listeners.scroll();
  assert.equal(page.body.children.length, 0, "grid scroll hides it");

  page.listeners.mouseover({ target: { closest: () => null }, relatedTarget: null });
  assert.equal(page.body.children.length, 0, "other chips and cells show nothing");
});

test("+N popup: flips above the chip at the bottom of the window and stays inside it", () => {
  const page = loadMain({ view: { width: 400, height: 300 }, popupSize: { width: 120, height: 48 } });
  page.showPopup(moreChip(["a", "b", "c"], { left: 350, top: 270, bottom: 286, width: 20, height: 16 }));
  assert.deepEqual(plain(page.body.children[0].style), { top: "218px", left: "276px" });
  page.hidePopup();
  assert.equal(page.showPopup(moreChip([], { left: 0, top: 0, bottom: 0 })), null, "nothing hidden, no popup");
});
