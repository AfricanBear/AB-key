// Guards against background work the extension does not need (v0.8.1).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createDefaultConfig } from "../src/shared/config-schema.js";
import { CONFIG_KEY, sleep } from "./helpers.mjs";

const manifest = JSON.parse(fs.readFileSync(new URL("../manifest.json", import.meta.url), "utf8"));
const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// --- manifest ------------------------------------------------------------------------------

test("no content script runs on every website", () => {
  for (const entry of manifest.content_scripts) {
    assert.ok(!entry.matches.includes("<all_urls>"), `${entry.js.join(", ")} must not match <all_urls>`);
    for (const pattern of entry.matches) assert.match(pattern, /abacum\.io/, pattern);
  }
});

test("host permissions are limited to Abacum", () => {
  assert.deepEqual(manifest.host_permissions, ["*://*.abacum.io/*"]);
  assert.ok(manifest.permissions.includes("activeTab"), "activeTab still lets the panel open on other sites on click");
});

// --- fake page for the two Abacum scripts ------------------------------------------------

function createEnv(config, { clientName = "Acme Energy", title = "01a. Natural P&L - Models - Abacum" } = {}) {
  const observers = [];
  const intervals = [];
  const nodes = new Map();
  let onChanged = null;
  let stored = config; // chrome.storage is already updated when onChanged fires
  let img = clientName ? { getAttribute: () => clientName } : null;
  const head = {
    appendChild(node) {
      nodes.set(node.id, node);
      node.remove = () => nodes.delete(node.id);
    }
  };
  const documentElement = { attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; } };
  const document = {
    readyState: "complete",
    title,
    head,
    documentElement,
    addEventListener() {},
    getElementById: (id) => nodes.get(id) || null,
    createElement: () => ({ id: "", textContent: "" }),
    querySelector: (selector) => (selector.startsWith("img[alt]") ? img : null)
  };
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
  const ctx = {
    Promise,
    setTimeout,
    clearTimeout,
    setInterval: (...args) => {
      intervals.push(args);
      return setInterval(() => {}, 1e9);
    },
    clearInterval,
    MutationObserver: FakeObserver,
    document,
    chrome: {
      storage: {
        local: { get: async () => ({ [CONFIG_KEY]: stored }) },
        onChanged: { addListener: (fn) => (onChanged = fn) }
      }
    }
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  return {
    run: async (path) => {
      vm.runInContext(read(path), ctx, { filename: path });
      await sleep(20);
    },
    document,
    head,
    nodes,
    observers,
    intervals,
    active: () => observers.filter((o) => o.active),
    setClientName: (name) => (img = name ? { getAttribute: () => name } : null),
    change: async (next) => {
      stored = next;
      onChanged({ [CONFIG_KEY]: { newValue: next } }, "local");
      await sleep(20);
    }
  };
}

// --- light theme nav -------------------------------------------------------------------------

test("light nav: no observer at all while the feature is off (default)", async () => {
  const env = createEnv(createDefaultConfig());
  await env.run("src/content/abacum-light-nav.js");
  assert.equal(env.observers.length, 0);
  assert.equal(env.nodes.get("ab-key-light-nav-styles"), undefined);
});

test("light nav: when on, watches only <head> children, and stops when turned off", async () => {
  const on = { ...createDefaultConfig(), lightThemeNavEnabled: true };
  const env = createEnv(on);
  await env.run("src/content/abacum-light-nav.js");
  assert.ok(env.nodes.get("ab-key-light-nav-styles"), "style injected");
  assert.equal(env.active().length, 1);
  assert.equal(env.active()[0].target, env.head);
  assert.equal(JSON.stringify(env.active()[0].options), JSON.stringify({ childList: true }), "no subtree, no attributes");

  env.nodes.get("ab-key-light-nav-styles").remove(); // React rebuilt <head>
  env.active()[0].callback();
  assert.ok(env.nodes.get("ab-key-light-nav-styles"), "style re-added");

  await env.change({ ...on, lightThemeNavEnabled: false });
  assert.equal(env.active().length, 0, "observer disconnected");
  assert.equal(env.nodes.get("ab-key-light-nav-styles"), undefined);
});

// --- tab title -------------------------------------------------------------------------------

test("tab title: prefixes the client name, watches only <head>, no permanent timer", async () => {
  const env = createEnv(createDefaultConfig());
  await env.run("src/content/abacum-tab-title.js");
  assert.equal(env.document.title, "Acme Energy | 01a. Natural P&L - Models - Abacum");
  assert.equal(env.intervals.length, 0, "no setInterval");
  assert.equal(env.active().length, 1);
  assert.equal(env.active()[0].target, env.head);
});

test("tab title: re-applies the prefix when Abacum rewrites the title", async () => {
  const env = createEnv(createDefaultConfig());
  await env.run("src/content/abacum-tab-title.js");
  env.document.title = "Revenue - Datasets - Abacum"; // SPA navigation
  env.active()[0].callback();
  assert.equal(env.document.title, "Acme Energy | Revenue - Datasets - Abacum");
});

test("tab title: waits for the client logo, then stops retrying", async () => {
  const env = createEnv(createDefaultConfig(), { clientName: null });
  await env.run("src/content/abacum-tab-title.js");
  assert.equal(env.document.title, "01a. Natural P&L - Models - Abacum");
  env.setClientName("Acme Energy");
  await sleep(1100); // one retry interval
  assert.equal(env.document.title, "Acme Energy | 01a. Natural P&L - Models - Abacum");
});

test("tab title: turning it off removes the prefix and the observer", async () => {
  const env = createEnv(createDefaultConfig());
  await env.run("src/content/abacum-tab-title.js");
  await env.change({ ...createDefaultConfig(), abacumTabTitleEnabled: false });
  assert.equal(env.document.title, "01a. Natural P&L - Models - Abacum");
  assert.equal(env.active().length, 0);
});
