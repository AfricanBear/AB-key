// AB-key guide: tips at the buttons (src/content/ab-key-guide.js + ab-key-guide-steps.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createDefaultConfig, migrateConfig } from "../src/shared/config-schema.js";
import { GUIDE_KEY, guideStateOnInstalled } from "../src/shared/guide-state.js";
import { CONFIG_KEY, loadV1Config, sleep } from "./helpers.mjs";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const STEPS_SCRIPT = read("src/content/ab-key-guide-steps.js");
const GUIDE_SCRIPT = read("src/content/ab-key-guide.js");
const manifest = JSON.parse(read("manifest.json"));

/** Pure part only: no document / chrome, so the page side does not start. */
function loadPure() {
  const ctx = { console };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(STEPS_SCRIPT, ctx);
  vm.runInContext(GUIDE_SCRIPT, ctx);
  return { guide: ctx.AbKeyGuide, steps: ctx.AbKeyGuideSteps };
}

const { guide, steps: STEPS } = loadPure();
// Objects made inside the vm have other prototypes; compare plain copies.
const plain = (value) => JSON.parse(JSON.stringify(value));
const ids = (items) => plain(items.map((item) => item.step.id));
const MODEL = "/app/modules/m1/edit";
const DATASET = "/app/datasets/d1/manager";
const everywhere = () => ({}); // every anchor on screen

function pick(overrides = {}) {
  return guide.pickSteps({
    steps: STEPS,
    config: createDefaultConfig(),
    state: { seen: [], baseline: "1.8.0" },
    hostname: "app.abacum.io",
    pathname: MODEL,
    anchorOf: everywhere,
    ...overrides
  });
}

// --- wiring ------------------------------------------------------------------------------------

test("manifest loads the steps before the guide, only on Abacum", () => {
  const entry = manifest.content_scripts.find((item) => item.js.includes("src/content/ab-key-guide.js"));
  assert.ok(entry, "guide is a content script");
  assert.deepEqual(entry.js, ["src/content/ab-key-guide-steps.js", "src/content/ab-key-guide.js"]);
  assert.deepEqual(entry.matches, ["*://*.abacum.io/*"]);
  assert.ok(!entry.world, "isolated world: it needs chrome.storage");
});

test("step ids are unique and every step names its page and version", () => {
  const all = STEPS.map((step) => step.id);
  assert.equal(new Set(all).size, all.length);
  for (const step of STEPS) {
    assert.ok(["any", "model", "dataset"].includes(step.page), step.id);
    assert.match(step.since, /^\d+\.\d+\.\d+$/, step.id);
    assert.ok(step.title && (step.text || step.lines), step.id);
    if (step.flag) assert.equal(typeof createDefaultConfig()[step.flag], "boolean", `${step.id}: ${step.flag} is a config flag`);
    for (const actionId of [...(step.keys || []), ...(step.lines || []).map((line) => line.actionId)]) {
      assert.ok(createDefaultConfig().actions.some((action) => action.actionId === actionId), `${step.id}: ${actionId}`);
    }
  }
});

test("config: guide on and 'only new' off by default; old configs get them, user values stay", () => {
  const defaults = createDefaultConfig();
  assert.equal(defaults.guideEnabled, true);
  assert.equal(defaults.guideOnlyNew, false);
  const migrated = migrateConfig(loadV1Config());
  assert.equal(migrated.guideEnabled, true);
  assert.equal(migrated.guideOnlyNew, false);
  const user = migrateConfig({ ...defaults, guideEnabled: false, guideOnlyNew: true });
  assert.equal(user.guideEnabled, false);
  assert.equal(user.guideOnlyNew, true);
});

test("guide state: install starts at this version, an update at the previous one; a baseline stays", () => {
  assert.deepEqual(guideStateOnInstalled(undefined, { reason: "install", version: "1.8.0" }), { seen: [], baseline: "1.8.0" });
  assert.deepEqual(guideStateOnInstalled(undefined, { reason: "update", previousVersion: "1.7.2", version: "1.8.0" }), {
    seen: [],
    baseline: "1.7.2"
  });
  assert.deepEqual(
    guideStateOnInstalled({ seen: ["nav"], baseline: "1.7.2" }, { reason: "update", previousVersion: "1.8.0", version: "1.9.0" }),
    { seen: ["nav"], baseline: "1.7.2" }
  );
  assert.ok(!GUIDE_KEY.startsWith("mv3ClickAutomation"), "seen tips are not part of the exported config");
  assert.match(GUIDE_SCRIPT, new RegExp(`GUIDE_KEY = "${GUIDE_KEY.replace(".", "\\.")}"`));
});

test("service worker sets the guide state on install and update", () => {
  const worker = read("src/background/service-worker.js");
  assert.match(worker, /onInstalled\.addListener\(async \(\{ reason, previousVersion \}\)/);
  assert.match(worker, /await initGuideState\(reason, previousVersion\)/);
});

// --- pure helpers ------------------------------------------------------------------------------

test("versions compare by number, not by text", () => {
  assert.equal(guide.compareVersions("1.10.0", "1.9.9"), 1);
  assert.equal(guide.compareVersions("1.7.2", "1.7.2"), 0);
  assert.equal(guide.compareVersions("0.10.0", "1.0"), -1);
});

test("a run of numbered keys becomes a range, anything else a list", () => {
  assert.equal(guide.joinKeys(["Alt+1", "Alt+2", "Alt+3", "Alt+4", "Alt+5"]), "Alt+1–5");
  assert.equal(guide.joinKeys(["Alt+Shift+1", "Alt+Shift+2", "Alt+Shift+3"]), "Alt+Shift+1–3");
  assert.equal(guide.joinKeys(["Alt+1", "Alt+3", "Alt+4"]), "Alt+1, Alt+3, Alt+4");
  assert.equal(guide.joinKeys(["Alt+Q"]), "Alt+Q");
});

test("page kinds", () => {
  assert.equal(guide.pageOf(MODEL), "model");
  assert.equal(guide.pageOf("/app/modules"), "other", "the models list has no builder");
  assert.equal(guide.pageOf(DATASET), "dataset");
  assert.equal(guide.pageOf("/app/spaces"), "other");
});

// --- which tips show ---------------------------------------------------------------------------

test("first visit of a model: welcome, then the general tips, then the model tips, in order", () => {
  assert.deepEqual(ids(pick()), [
    "welcome",
    "nav",
    "rail",
    "aiChat",
    "academy",
    "modelSave",
    "variableRow",
    "modelDimensions",
    "bulkDimensions",
    "formulaWordDelete"
  ]);
});

test("a dataset page shows the dataset tips, not the model ones", () => {
  const shown = ids(pick({ pathname: DATASET, state: { seen: ["welcome", "nav", "rail", "aiChat", "academy"], baseline: "1.8.0" } }));
  assert.deepEqual(shown, ["datasetPin", "datasetSum", "datasetTransformLink"]);
});

test("a tip whose button is not on screen waits; the welcome card alone never opens a tour", () => {
  const onlyNav = (step) => (step.id === "nav" ? {} : null);
  assert.deepEqual(ids(pick({ anchorOf: onlyNav })), ["welcome", "nav"]);
  assert.deepEqual(ids(pick({ anchorOf: () => null })), []);
});

test("seen tips are not shown again; replay shows them, even with the guide off", () => {
  const seen = STEPS.map((step) => step.id);
  assert.deepEqual(ids(pick({ state: { seen, baseline: "1.8.0" } })), []);
  const config = { ...createDefaultConfig(), guideEnabled: false };
  assert.deepEqual(ids(pick({ config })), []);
  const replay = pick({ config, state: { seen, baseline: "1.8.0" }, mode: "replay" });
  assert.equal(ids(replay)[0], "welcome");
  assert.ok(ids(replay).includes("variableRow"));
  assert.deepEqual(ids(pick({ mode: "replay", anchorOf: () => null })), ["welcome"], "replay on a page without tips");
});

test("a tip of a feature switched off in Options is left out", () => {
  const config = { ...createDefaultConfig(), modelDimensionsEnabled: false, formulaWordDeleteEnabled: false };
  const shown = ids(pick({ config }));
  assert.ok(!shown.includes("modelDimensions"));
  assert.ok(!shown.includes("formulaWordDelete"));
});

test("tips show the user's own keys; unbound or disabled hotkeys drop their tip or line", () => {
  const config = createDefaultConfig();
  config.hotkeys.find((hotkey) => hotkey.actionId === "action.save").key = "alt+w";
  config.hotkeys = config.hotkeys.filter((hotkey) => hotkey.actionId !== "action.aiChat");
  config.actions.find((action) => action.actionId === "action.deleteVariable").enabled = false;
  const items = pick({ config });
  assert.equal(items.find((item) => item.step.id === "modelSave").keys, "Alt+W");
  assert.ok(!ids(items).includes("aiChat"));
  assert.equal(items.find((item) => item.step.id === "nav").keys, "Alt+Shift+1–9");
  assert.equal(items.find((item) => item.step.id === "rail").keys, "Alt+1–5");
  const lines = plain(items.find((item) => item.step.id === "variableRow").lines.map((line) => `${line.key} ${line.text}`));
  assert.deepEqual(lines, ["Alt+R Rename", "Alt+C Duplicate (saved at once)", "Alt+G AI description", "Alt+A New variable"]);
});

test("'Only new features' shows only what shipped after the version the user started with", () => {
  const config = { ...createDefaultConfig(), guideOnlyNew: true };
  const items = pick({ config, state: { seen: [], baseline: "1.4.0" } });
  // variableRow counts as new because its Alt+G line shipped in 1.5.0.
  assert.deepEqual(ids(items), ["variableRow", "modelDimensions"]);
  assert.ok(items.every((item) => item.isNew));
  assert.deepEqual(ids(pick({ config, state: { seen: [], baseline: "1.8.0" } })), [], "a fresh install has nothing new yet");
  assert.equal(pick().find((item) => item.step.id === "nav").isNew, false, "no New badge on old features");
});

test("the periodic check stops when nothing can show any more", () => {
  const config = createDefaultConfig();
  const all = STEPS.map((step) => step.id);
  const args = { steps: STEPS, hostname: "app.abacum.io" };
  assert.equal(guide.hasPending({ ...args, config, state: { seen: [] } }), true);
  assert.equal(guide.hasPending({ ...args, config, state: { seen: all } }), false);
  assert.equal(guide.hasPending({ ...args, config: { ...config, guideEnabled: false }, state: { seen: [] } }), false);
  assert.equal(
    guide.hasPending({ ...args, config: { ...config, guideOnlyNew: true }, state: { seen: [], baseline: "9.0.0" } }),
    false
  );
});

// --- placement ---------------------------------------------------------------------------------

test("the tip goes below the button, above near the bottom, and stays inside the window", () => {
  const viewport = { width: 1000, height: 800 };
  const size = { width: 300, height: 150 };
  const rect = (left, top, width = 40, height = 30) => ({ left, top, width, height, right: left + width, bottom: top + height });
  assert.deepEqual(plain(guide.placeTip(rect(480, 100), size, viewport)), { side: "bottom", left: 350, top: 140 });
  assert.equal(guide.placeTip(rect(480, 740), size, viewport).side, "top");
  const corner = guide.placeTip(rect(960, 10), size, viewport);
  assert.equal(corner.left, 1000 - 300 - 8, "clamped to the right edge");
  const tall = guide.placeTip(rect(10, 0, 40, 800), size, viewport);
  assert.equal(tall.side, "right", "a full-height column puts the tip beside it");
  assert.equal(guide.placeTip(null, size, viewport).side, "center");
});

// --- page side ---------------------------------------------------------------------------------

function fakeNode(tag) {
  const node = {
    tagName: String(tag).toUpperCase(),
    className: "",
    textContent: "",
    style: {},
    attrs: {},
    childNodes: [],
    listeners: {},
    isConnected: true,
    get children() {
      return this.childNodes;
    },
    setAttribute(name, value) {
      this.attrs[name] = value;
    },
    getAttribute(name) {
      return this.attrs[name] ?? null;
    },
    addEventListener(type, fn) {
      this.listeners[type] = fn;
    },
    appendChild(child) {
      this.childNodes.push(child);
      child.parentNode = this;
      return child;
    },
    append(...children) {
      for (const child of children) this.appendChild(child);
    },
    remove() {
      if (this.parentNode) this.parentNode.childNodes = this.parentNode.childNodes.filter((child) => child !== this);
      this.isConnected = false;
    },
    attachShadow() {
      this.shadow = fakeNode("#shadow");
      return this.shadow;
    },
    querySelector(selector) {
      const cls = selector.replace(/^\./, "");
      for (const child of this.childNodes) {
        if (String(child.className).split(" ").includes(cls)) return child;
        const found = child.querySelector?.(selector);
        if (found) return found;
      }
      return null;
    },
    all() {
      return [this, ...this.childNodes.flatMap((child) => child.all?.() || [])];
    },
    getBoundingClientRect: () => ({ left: 100, top: 100, width: 40, height: 30, right: 140, bottom: 130 })
  };
  return node;
}

async function loadPage({ config = createDefaultConfig(), guideState = { seen: [], baseline: "1.8.0" }, pathname = MODEL } = {}) {
  const store = { [CONFIG_KEY]: config, [GUIDE_KEY]: guideState };
  const intervals = [];
  const timeouts = [];
  let onMessage = null;
  const documentElement = fakeNode("html");
  const button = fakeNode("button");
  const ctx = {
    console,
    Promise,
    setTimeout: (fn) => timeouts.push(fn),
    clearTimeout() {},
    setInterval: (fn, ms) => {
      intervals.push(ms);
      return intervals.length;
    },
    clearInterval() {},
    addEventListener() {},
    removeEventListener() {},
    innerWidth: 1600,
    innerHeight: 900,
    location: { hostname: "app.abacum.io", pathname },
    document: {
      hidden: false,
      documentElement,
      createElement: fakeNode,
      querySelector: () => null,
      querySelectorAll: () => []
    },
    chrome: {
      runtime: { getManifest: () => ({ version: "1.8.0" }), onMessage: { addListener: (fn) => (onMessage = fn) } },
      storage: {
        local: {
          get: async (keys) => Object.fromEntries([].concat(keys).map((key) => [key, store[key]])),
          set: async (values) => Object.assign(store, values)
        },
        onChanged: { addListener() {} }
      }
    },
    AbKeySidebarNav: { listLinks: () => [{ button }] },
    AbKeyToolbarRail: { listButtons: () => ({ buttons: [button] }) }
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(STEPS_SCRIPT, ctx);
  vm.runInContext(GUIDE_SCRIPT, ctx);
  await sleep(0);
  const replay = async () => {
    let response;
    const keep = onMessage({ type: "AB_KEY_GUIDE_REPLAY" }, {}, (value) => (response = value));
    assert.equal(keep, true, "answers asynchronously");
    await sleep(0);
    return response;
  };
  const fireFirstCheck = () => timeouts.shift()?.();
  return { intervals, store, documentElement, replay, fireFirstCheck };
}

test("page: no periodic check when the guide is off or everything was seen", async () => {
  const off = await loadPage({ config: { ...createDefaultConfig(), guideEnabled: false } });
  assert.deepEqual(off.intervals, []);
  const done = await loadPage({ guideState: { seen: STEPS.map((step) => step.id), baseline: "1.8.0" } });
  assert.deepEqual(done.intervals, []);
  const fresh = await loadPage();
  assert.deepEqual(fresh.intervals, [2000], "one cheap check every 2 s while tips are pending");
});

test("page: replay draws the tour in a shadow root and does not mark tips as seen", async () => {
  const page = await loadPage({ config: { ...createDefaultConfig(), guideEnabled: false } });
  const response = await page.replay();
  assert.equal(response.ok, true);
  assert.ok(response.count >= 2, "welcome + nav + rail at least");
  const host = page.documentElement.childNodes.find((node) => node.id === "ab-key-guide");
  assert.ok(host?.shadow, "drawn in a shadow root");
  const text = host.shadow.all().map((node) => node.textContent).join(" ");
  assert.match(text, /AB-key tips/);
  assert.match(text, /1 \/ \d+/);
  assert.ok(!/Turn off tips/.test(text), "replay has no 'Turn off tips'");
  assert.deepEqual(plain(page.store[GUIDE_KEY].seen), []);
});

test("page: an automatic tour marks shown tips as seen, Next moves on, Turn off writes the flag", async () => {
  const page = await loadPage();
  page.fireFirstCheck();
  const host = page.documentElement.childNodes.find((node) => node.id === "ab-key-guide");
  assert.ok(host, "the first check opened the tour");
  const texts = () => host.shadow.all().map((node) => node.textContent).join(" ");
  assert.match(texts(), /AB-key tips/);
  assert.match(texts(), /Turn off tips/);
  await sleep(0);
  assert.deepEqual(plain(page.store[GUIDE_KEY].seen), ["welcome"]);
  host.shadow.all().find((node) => node.textContent === "Next").listeners.click();
  assert.match(texts(), /2 \/ \d+/);
  assert.match(texts(), /Jump between sections/);
  await sleep(0);
  assert.deepEqual(plain(page.store[GUIDE_KEY].seen), ["welcome", "nav"]);
  host.shadow.all().find((node) => node.textContent === "Turn off tips").listeners.click();
  await sleep(0);
  assert.equal(page.store[CONFIG_KEY].guideEnabled, false);
  assert.ok(!host.isConnected, "the tip is gone");
});

test("page: × on an automatic tour marks the rest of the page as seen", async () => {
  const page = await loadPage();
  page.fireFirstCheck();
  const host = page.documentElement.childNodes.find((node) => node.id === "ab-key-guide");
  host.shadow.all().find((node) => node.textContent === "×").listeners.click();
  await sleep(0);
  assert.deepEqual(plain(page.store[GUIDE_KEY].seen), ["welcome", "nav", "rail"], "the tips that had buttons on screen");
});
