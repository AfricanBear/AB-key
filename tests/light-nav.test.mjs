// Light theme nav (src/content/abacum-light-nav.js): stable selectors and the current section.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createDefaultConfig } from "../src/shared/config-schema.js";
import { CONFIG_KEY, sleep } from "./helpers.mjs";

const SCRIPT = fs.readFileSync(new URL("../src/content/abacum-light-nav.js", import.meta.url), "utf8");

// Left nav as Abacum renders it (Nov 2026): button inside <a href>. Search and More are
// wrapped in a link to the *current* page (CURRENT), e.g. "/app/modules" on the models list.
const CURRENT = Symbol("current page");
const NAV = [
  ["AgentHub", "/app/agent-hub"],
  ["Search", CURRENT],
  ["Library", "/app/library"],
  ["Spaces", "/app/spaces"],
  ["Models", "/app/modules"],
  ["Versions", "/app/versions"],
  ["Dimensions", "/app/dimensions"],
  ["Datasets", "/app/datasets"],
  ["More", CURRENT],
  ["Settings", null]
];

function load({ pathname, enabled = true }) {
  const location = { pathname };
  const observers = [];
  const listeners = {};
  const nodes = new Map();
  const head = {
    appendChild(node) {
      nodes.set(node.id, node);
      node.remove = () => nodes.delete(node.id);
    }
  };
  const buttons = NAV.map(([name, href]) => {
    const attrs = new Map();
    const link = href ? { getAttribute: (a) => (a !== "href" ? null : href === CURRENT ? location.pathname : href) } : null;
    return {
      name,
      testid: `sidebar-section-button-${name}`,
      attrs,
      getAttribute: (a) => (a === "data-testid" ? `sidebar-section-button-${name}` : null),
      closest: (selector) => (selector === "a[href^='/app/']" ? link : null),
      hasAttribute: (a) => attrs.has(a),
      setAttribute: (a, v) => attrs.set(a, v),
      removeAttribute: (a) => attrs.delete(a)
    };
  });
  const document = {
    readyState: "complete",
    head,
    documentElement: { setAttribute() {}, removeAttribute() {} },
    addEventListener() {},
    getElementById: (id) => nodes.get(id) || null,
    createElement: () => ({ id: "", textContent: "" }),
    querySelectorAll: (selector) => {
      if (selector === '[data-testid="sidebar"] [data-testid^="sidebar-section-button-"]') return buttons;
      if (selector === "[data-ab-key-nav-active]") return buttons.filter((b) => b.attrs.has("data-ab-key-nav-active"));
      return [];
    }
  };
  class FakeObserver {
    constructor(callback) {
      this.callback = callback;
      this.active = false;
      observers.push(this);
    }
    observe(target, options) {
      Object.assign(this, { target, options, active: true });
    }
    disconnect() {
      this.active = false;
    }
  }
  let onChanged = null;
  const ctx = {
    URL,
    Promise,
    document,
    location,
    MutationObserver: FakeObserver,
    addEventListener: (type, fn) => (listeners[type] = fn),
    removeEventListener: (type) => delete listeners[type],
    chrome: {
      storage: {
        local: { get: async () => ({ [CONFIG_KEY]: { ...createDefaultConfig(), lightThemeNavEnabled: enabled } }) },
        onChanged: { addListener: (fn) => (onChanged = fn) }
      }
    }
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(SCRIPT, ctx);
  return {
    api: ctx.AbKeyLightNav,
    css: () => nodes.get("ab-key-light-nav-styles")?.textContent || "",
    active: () => buttons.filter((b) => b.attrs.has("data-ab-key-nav-active")).map((b) => b.name),
    navigate(path, via = "title") {
      location.pathname = path;
      if (via === "popstate") listeners.popstate?.();
      else observers.filter((o) => o.active).forEach((o) => o.callback([]));
    },
    observers,
    listeners,
    turnOff: async () => {
      ctx.chrome.storage.local.get = async () => ({ [CONFIG_KEY]: { ...createDefaultConfig(), lightThemeNavEnabled: false } });
      onChanged({ [CONFIG_KEY]: {} });
      await sleep(20);
    }
  };
}

test("CSS uses only stable anchors and never touches the right drawer", async () => {
  const nav = load({ pathname: "/app/spaces/0d32" });
  await sleep(20);
  const css = nav.css();
  assert.ok(css.includes('[data-testid="sidebar"] .MuiDrawer-paper'), "left drawer by test id");
  assert.ok(css.includes('[data-testid^="sidebar-section-button-"]'), "nav buttons by test id");
  assert.doesNotMatch(css, /\.css-[a-z0-9]+/, "no hashed Emotion classes");
  for (const rule of css.split("}")) {
    if (rule.includes("MuiDrawer-paper")) assert.ok(rule.includes('[data-testid="sidebar"]'), `scoped: ${rule.trim().slice(0, 60)}`);
  }
});

test("the current section is marked from the URL; Search and More never are", async () => {
  const cases = [
    ["/app/spaces/0d32", ["Spaces"]],
    ["/app/modules/8dbb/edit", ["Models"]],
    ["/app/modules", ["Models"]], // Search / More link here too (regression)
    ["/app/spaces", ["Spaces"]],
    ["/app/datasets/8439/manager", ["Datasets"]],
    ["/app/agent-hub", ["AgentHub"]],
    ["/app/integrations", []]
  ];
  for (const [pathname, expected] of cases) {
    const nav = load({ pathname });
    await sleep(20);
    assert.deepEqual(nav.active(), expected, pathname);
  }
});

test("the mark follows in-app navigation (title change) and the back button", async () => {
  const nav = load({ pathname: "/app/spaces/0d32" });
  await sleep(20);
  nav.navigate("/app/modules/8dbb/edit");
  assert.deepEqual(nav.active(), ["Models"]);
  nav.navigate("/app/versions", "popstate");
  assert.deepEqual(nav.active(), ["Versions"]);
});

test("turning the feature off removes the style, the marks and the listeners", async () => {
  const nav = load({ pathname: "/app/spaces/0d32" });
  await sleep(20);
  assert.equal(nav.active().length, 1);
  await nav.turnOff();
  assert.equal(nav.css(), "");
  assert.deepEqual(nav.active(), []);
  assert.equal(nav.observers.filter((o) => o.active).length, 0);
  assert.equal(nav.listeners.popstate, undefined);
});

test("off by default: nothing is marked", async () => {
  const nav = load({ pathname: "/app/spaces/0d32", enabled: false });
  await sleep(20);
  assert.deepEqual(nav.active(), []);
  assert.equal(nav.css(), "");
});
