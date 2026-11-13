// Left navigation lookup for Alt+Shift+1–9 (src/content/sidebar-nav.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const SCRIPT = fs.readFileSync(new URL("../src/content/sidebar-nav.js", import.meta.url), "utf8");

/**
 * items: [name, { href, label, visible }] in DOM order, as Abacum renders them:
 * button[data-testid="sidebar-section-button-<name>"] inside <a href="…">.
 */
function load(items) {
  const buttons = items.map(([name, { href = `/app/${name.toLowerCase()}`, label = name, visible = true } = {}]) => {
    const link = href === null ? null : { name: `link:${name}`, href, getBoundingClientRect: () => ({ width: visible ? 32 : 0, height: visible ? 32 : 0 }) };
    return {
      getAttribute: (attr) => (attr === "data-testid" ? `sidebar-section-button-${name}` : attr === "aria-label" ? label : null),
      closest: (selector) => (selector === "a[href^='/app/']" && link && link.href.startsWith("/app/") ? link : null)
    };
  });
  const ctx = {
    document: { querySelectorAll: (selector) => (selector === '[data-testid^="sidebar-section-button-"]' ? buttons : []) }
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(SCRIPT, ctx);
  return ctx.AbKeySidebarNav;
}

// Live order, Nov 2026.
const LIVE = [
  ["AgentHub", { label: "Home", href: "/app/agent-hub" }],
  ["Search", { href: "/app/spaces/1" }],
  ["Notifications", { href: null }],
  ["Library"],
  ["Spaces"],
  ["Models", { href: "/app/modules" }],
  ["Versions"],
  ["Dimensions"],
  ["Datasets"],
  ["Integrations"],
  ["More", { href: "/app/spaces/1" }],
  ["WhatsNew", { label: "What's new", href: "https://announcekit.co/abacum" }],
  ["HelpAndSupport", { label: "Help & support", href: null }],
  ["Settings", { href: null }]
];

test("counts the links after Library and skips More and the bottom items", () => {
  const nav = load(LIVE);
  assert.deepEqual(
    [...nav.describe().map((item) => item.label)],
    ["Spaces", "Models", "Versions", "Dimensions", "Datasets", "Integrations"]
  );
  assert.equal(nav.getLink(1).element.name, "link:Spaces");
  assert.equal(nav.getLink(6).element.name, "link:Integrations");
  assert.equal(nav.getLink(7).element, null, "More is not position 7");
  assert.equal(nav.getLink(7).total, 6);
});

test("new sections and links moved out of More shift the positions by themselves", () => {
  const grown = [...LIVE];
  grown.splice(10, 1, ["Reports"], ["Scenarios"]); // More removed, its links shown inline
  const nav = load(grown);
  assert.deepEqual([...nav.describe().map((item) => item.label)].slice(5), ["Integrations", "Reports", "Scenarios"]);
  assert.equal(nav.getLink(8).element.name, "link:Scenarios");
});

test("hidden links are skipped; without Library nothing is matched", () => {
  const hidden = LIVE.map(([name, opts]) => (name === "Versions" ? [name, { ...opts, visible: false }] : [name, opts]));
  assert.equal(load(hidden).getLink(3).element.name, "link:Dimensions");
  assert.equal(load(LIVE.filter(([name]) => name !== "Library")).describe().length, 0);
});
