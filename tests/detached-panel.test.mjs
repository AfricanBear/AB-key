// "Pop out to a new window" for the hotkey panel (v1.7.0).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {
  BOUNDS_KEY,
  DEFAULT_WIDTH,
  DETACH_MESSAGE,
  isDetachedPanelUrl,
  openDetachedPanel
} from "../src/background/detached-window.js";
import { CONTEXT_MESSAGE, createLiveContext } from "../src/popup/live-context.js";
import { sleep } from "./helpers.mjs";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const EXT = "chrome-extension://abkey/";

// --- background: open or focus the window ---------------------------------------------------

function fakeBackground({ contexts = [], saved = undefined, failWithPosition = false } = {}) {
  const calls = { create: [], update: [] };
  const api = {
    runtime: {
      getURL: (path) => EXT + path,
      getContexts: async ({ contextTypes }) => {
        assert.deepEqual(contextTypes, ["TAB"]);
        return contexts;
      }
    },
    storage: { local: { get: async (key) => (saved ? { [key]: saved } : {}) } },
    windows: {
      create: async (options) => {
        calls.create.push({ ...options });
        if (failWithPosition && "left" in options) throw new Error("Invalid value for bounds");
        return { id: 77 };
      },
      update: async (id, options) => {
        calls.update.push([id, options]);
      }
    }
  };
  return { api, calls };
}

test("Pop out opens a popup window (no address bar) with the page context and the source tab", async () => {
  const { api, calls } = fakeBackground();
  const search = "?host=app.abacum.io&path=%2Fapp%2Fmodules%2Fm1&rail=%5B%22Info%22%5D&nav=%5B%22Models%22%5D&junk=1";
  const result = await openDetachedPanel({ sourceTabId: 12, search }, api);
  assert.deepEqual(result, { windowId: 77, created: true });
  assert.equal(calls.create.length, 1);
  const options = calls.create[0];
  assert.equal(options.type, "popup");
  assert.equal(options.focused, true);
  assert.equal(options.width, DEFAULT_WIDTH);
  assert.ok(!("left" in options), "no saved position yet");
  const url = new URL(options.url);
  assert.equal(url.href.split("?")[0], `${EXT}src/popup/popup.html`);
  assert.equal(url.searchParams.get("detached"), "1");
  assert.equal(url.searchParams.get("tab"), "12");
  assert.equal(url.searchParams.get("path"), "/app/modules/m1");
  assert.equal(url.searchParams.get("rail"), '["Info"]');
  assert.equal(url.searchParams.get("nav"), '["Models"]');
  assert.equal(url.searchParams.get("junk"), null);
  assert.ok(isDetachedPanelUrl(options.url));
});

test("a second Pop out focuses the open window instead of creating another", async () => {
  const { api, calls } = fakeBackground({
    contexts: [
      { documentUrl: `${EXT}src/options/options.html`, windowId: 1 },
      { documentUrl: `${EXT}src/popup/popup.html?host=app.abacum.io`, windowId: 2 }, // in-page iframe
      { documentUrl: `${EXT}src/popup/popup.html?detached=1&tab=5`, windowId: 9 }
    ]
  });
  const result = await openDetachedPanel({ sourceTabId: 5, search: "" }, api);
  assert.deepEqual(result, { windowId: 9, created: false });
  assert.equal(calls.create.length, 0);
  assert.deepEqual(calls.update, [[9, { focused: true }]]);
});

test("the window opens where it was last left, and falls back if that place is invalid", async () => {
  const saved = { left: 1500, top: 40, width: 420 };
  const ok = fakeBackground({ saved });
  await openDetachedPanel({}, ok.api);
  assert.equal(ok.calls.create[0].left, 1500);
  assert.equal(ok.calls.create[0].top, 40);
  assert.equal(ok.calls.create[0].width, 420);

  const bad = fakeBackground({ saved, failWithPosition: true });
  const result = await openDetachedPanel({}, bad.api);
  assert.equal(result.created, true);
  assert.equal(bad.calls.create.length, 2);
  assert.ok(!("left" in bad.calls.create[1]));
});

test("service worker answers the Pop out message from the panel", () => {
  const worker = read("src/background/service-worker.js");
  assert.match(worker, /import \{ DETACH_MESSAGE, openDetachedPanel \} from "\.\/detached-window\.js"/);
  assert.match(worker, /message\?\.type !== DETACH_MESSAGE/);
  assert.match(worker, /sourceTabId: sender\.tab\?\.id/);
  assert.match(read("src/popup/popup.js"), new RegExp(`type: "${DETACH_MESSAGE}"`));
});

test("windows only need permissions the extension already has", () => {
  const manifest = JSON.parse(read("manifest.json"));
  assert.deepEqual(manifest.permissions, ["storage", "activeTab", "scripting"]);
  assert.ok(!BOUNDS_KEY.startsWith("mv3ClickAutomation"), "window bounds are not part of the config");
});

// --- panel: button and detached mode ----------------------------------------------------------

test("panel header has a Pop out button next to Options, hidden in the detached window", () => {
  const html = read("src/popup/popup.html");
  assert.match(html, /<div class="panel-header-actions">[\s\S]*?<button[^>]*id="detachButton"[^>]*title="Pop out to a new window"[\s\S]*?id="optionsButton"/);
  const css = read("src/popup/popup.css");
  assert.match(css, /html\.is-detached \.panel-detach-btn \{\s*display: none;/);
  const script = read("src/popup/popup.js");
  assert.match(script, /panelParams\.get\("detached"\) === "1"/);
  assert.match(script, /postMessage\(\{ type: "AB_KEY_PANEL_CLOSE" \}/);
});

// --- page: the in-page panel closes and reports its context -----------------------------------

function runPanelHost({ rail = ["Info", "Settings"], nav = ["Spaces", "Models"], guide } = {}) {
  const listeners = { message: [], runtime: [] };
  const nodes = new Map();
  const makeNode = (tag) => {
    const node = {
      tag,
      id: "",
      style: {},
      className: "",
      children: [],
      contentWindow: tag === "iframe" ? { name: "panel" } : undefined,
      setAttribute() {},
      addEventListener() {},
      removeEventListener() {},
      appendChild(child) {
        this.children.push(child);
      },
      querySelector() {
        return this.children[0] || null;
      },
      remove() {
        nodes.delete(this.id);
      }
    };
    return node;
  };
  const document = {
    documentElement: {
      appendChild(node) {
        nodes.set(node.id, node);
      }
    },
    createElement: makeNode,
    getElementById: (id) => nodes.get(id) || null,
    querySelector: (selector) => (selector.startsWith("#ab-key-panel-root") ? nodes.get("ab-key-panel-root")?.children[0] || null : null),
    addEventListener() {},
    removeEventListener() {}
  };
  const window = { addEventListener: (type, fn) => listeners[type]?.push(fn) };
  const context = {
    window,
    document,
    location: { hostname: "app.abacum.io", pathname: "/app/datasets/d1/manager" },
    URLSearchParams,
    JSON,
    chrome: {
      runtime: {
        getURL: (path) => EXT + path,
        onMessage: { addListener: (fn) => listeners.runtime.push(fn) }
      }
    },
    AbKeyToolbarRail: { describe: () => ({ buttons: rail.map((label) => ({ label })) }) },
    AbKeySidebarNav: { describe: () => nav.map((label) => ({ label })) },
    AbKeyGuide: guide
  };
  context.globalThis = context;
  vm.runInNewContext(read("src/content/ab-key-panel-host.js"), context);
  const send = (message) => {
    let response;
    listeners.runtime[0](message, {}, (value) => (response = value));
    return response;
  };
  const post = (data, source) => listeners.message[0]({ data, source });
  return { nodes, send, post };
}

test("the page answers the detached window with its path, rail and nav labels", () => {
  const { send } = runPanelHost();
  const response = send({ type: CONTEXT_MESSAGE });
  assert.equal(response.ok, true);
  assert.deepEqual(JSON.parse(JSON.stringify(response.context)), {
    host: "app.abacum.io",
    path: "/app/datasets/d1/manager",
    rail: ["Info", "Settings"],
    nav: ["Spaces", "Models"]
  });
});

test("the in-page panel closes after Pop out, but only on a message from its own iframe", () => {
  const { nodes, send, post } = runPanelHost();
  assert.equal(send({ type: "TOGGLE_AB_KEY_PANEL" }).open, true);
  const iframe = nodes.get("ab-key-panel-root").children[0];
  assert.match(iframe.src, /rail=%5B%22Info%22%2C%22Settings%22%5D/, "context still goes into the iframe URL");
  post({ type: "AB_KEY_PANEL_CLOSE" }, { name: "someone else" });
  assert.ok(nodes.has("ab-key-panel-root"));
  post({ type: "AB_KEY_PANEL_CLOSE" }, iframe.contentWindow);
  assert.ok(!nodes.has("ab-key-panel-root"));
  assert.ok(!nodes.has("ab-key-panel-backdrop"));
});

test("the ? button of the in-page panel closes it and replays the guide of the page", () => {
  const replays = [];
  const { nodes, send, post } = runPanelHost({ guide: { replay: () => replays.push("replay") } });
  send({ type: "TOGGLE_AB_KEY_PANEL" });
  const iframe = nodes.get("ab-key-panel-root").children[0];
  post({ type: "AB_KEY_GUIDE_REPLAY" }, { name: "someone else" });
  assert.deepEqual(replays, []);
  assert.ok(nodes.has("ab-key-panel-root"));
  post({ type: "AB_KEY_GUIDE_REPLAY" }, iframe.contentWindow);
  assert.deepEqual(replays, ["replay"]);
  assert.ok(!nodes.has("ab-key-panel-root"));
});

test("panel header has a ? button for the guide, only on Abacum pages", () => {
  const html = read("src/popup/popup.html");
  assert.match(html, /<div class="panel-header-actions">\s*<button[^>]*id="guideButton"[^>]*hidden>\?<\/button>/);
  const css = read("src/popup/popup.css");
  assert.match(css, /\.panel-options-btn\[hidden\] \{\s*display: none;/, "the button's display:inline-flex must not beat hidden");
  const script = read("src/popup/popup.js");
  assert.match(script, /guideButton\.hidden = !\/\(\^\|\\.\)abacum\\.io\$\/\.test\(panelHostname\)/);
  assert.match(script, /postMessage\(\{ type: GUIDE_REPLAY_MESSAGE \}/);
  assert.match(script, /chrome\.tabs\.sendMessage\(tabId, \{ type: GUIDE_REPLAY_MESSAGE \}\)/, "the detached window replays in its Abacum tab");
});

// --- detached window: follows the active Abacum tab -------------------------------------------

function fakeTabsApi({ answers = {}, activeByWindow = {}, lastFocused = 1 } = {}) {
  const events = {};
  const event = (name) => ({
    addListener: (fn) => (events[name] = fn),
    removeListener: () => delete events[name]
  });
  const sent = [];
  const api = {
    tabs: {
      sendMessage: async (tabId, message) => {
        sent.push([tabId, message.type]);
        if (!(tabId in answers)) throw new Error("Receiving end does not exist.");
        return { ok: true, context: answers[tabId] };
      },
      query: async ({ windowId }) => (activeByWindow[windowId] ? [{ id: activeByWindow[windowId] }] : []),
      onActivated: event("activated"),
      onUpdated: event("updated")
    },
    windows: {
      WINDOW_ID_NONE: -1,
      getLastFocused: async () => ({ id: lastFocused }),
      onFocusChanged: event("focus")
    }
  };
  return { api, events, sent };
}

const immediate = { retryDelays: [0], setTimer: (fn) => (fn(), 0), clearTimer() {} };

test("the detached window shows the context of the tab it was popped out from", async () => {
  const { api } = fakeTabsApi({ answers: { 5: { path: "/app/modules/m1" } } });
  const seen = [];
  const live = createLiveContext({ api, ownWindowId: 9, onContext: (c) => seen.push(c.path), ...immediate });
  await live.start(5);
  await sleep(0);
  assert.deepEqual(seen, ["/app/modules/m1"]);
  assert.equal(live.tabId, 5);
});

test("switching tabs or windows follows the new Abacum tab; other sites keep the last context", async () => {
  const { api, events } = fakeTabsApi({
    answers: { 5: { path: "/a" }, 6: { path: "/b" }, 8: { path: "/c" } },
    activeByWindow: { 2: 8 }
  });
  const seen = [];
  const live = createLiveContext({ api, ownWindowId: 9, onContext: (c) => seen.push(c.path), ...immediate });
  await live.start(5);
  events.activated({ tabId: 6, windowId: 1 });
  await sleep(0);
  events.activated({ tabId: 7, windowId: 1 }); // not Abacum: no answer
  await sleep(0);
  assert.deepEqual(seen, ["/a", "/b"]);
  events.activated({ tabId: 99, windowId: 9 }); // our own window is ignored
  events.focus(9);
  events.focus(-1);
  events.focus(2);
  await sleep(0);
  assert.deepEqual(seen, ["/a", "/b", "/c"]);
  assert.equal(live.tabId, 8);
});

test("navigation in the tracked tab asks again; other tabs' updates are ignored", async () => {
  const answers = { 5: { path: "/a" } };
  const { api, events, sent } = fakeTabsApi({ answers });
  const seen = [];
  const live = createLiveContext({ api, ownWindowId: 9, onContext: (c) => seen.push(c.path), ...immediate });
  await live.start(5);
  answers[5] = { path: "/b" };
  events.updated(6, { url: "https://example.com" });
  events.updated(5, { title: "x" });
  assert.equal(sent.length, 1);
  events.updated(5, { url: "https://app.abacum.io/b" });
  await sleep(0);
  assert.deepEqual(seen, ["/a", "/b"]);
  live.stop();
  assert.deepEqual(Object.keys(events), []);
});

test("without a source tab the window starts from the last focused normal window", async () => {
  const { api } = fakeTabsApi({ answers: { 4: { path: "/x" } }, activeByWindow: { 1: 4 }, lastFocused: 1 });
  const seen = [];
  const live = createLiveContext({ api, ownWindowId: 9, onContext: (c) => seen.push(c.path), ...immediate });
  await live.start();
  await sleep(0);
  assert.deepEqual(seen, ["/x"]);
});

test("a late answer from a tab the window no longer follows is dropped", async () => {
  let release;
  const { api, events } = fakeTabsApi({ answers: { 6: { path: "/b" } } });
  api.tabs.sendMessage = async (tabId) => {
    if (tabId === 5) await new Promise((resolve) => (release = resolve));
    return { ok: true, context: { path: tabId === 5 ? "/a" : "/b" } };
  };
  const seen = [];
  const live = createLiveContext({ api, ownWindowId: 9, onContext: (c) => seen.push(c.path), ...immediate });
  await live.start(5);
  events.activated({ tabId: 6, windowId: 1 });
  await sleep(0);
  release();
  await sleep(0);
  assert.deepEqual(seen, ["/b"]);
});
