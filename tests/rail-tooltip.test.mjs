import { test } from "node:test";
import assert from "node:assert/strict";
import { createDefaultConfig } from "../src/shared/config-schema.js";
import { createPage, createTooltip, loadContentScript, sleep } from "./helpers.mjs";

const DATASET_RAIL = ["Info", "Scheduler", "Transform", "Data usage", "Activity"];

async function hoverRail(index, tooltipText, config = createDefaultConfig()) {
  const tooltip = createTooltip(tooltipText);
  const page = createPage({ tooltips: [tooltip] });
  const rail = DATASET_RAIL.map((name) => page.element(name));
  const script = await loadContentScript(config, page, { rail });
  script.hover(index === null ? { closest: () => null } : rail[index]);
  await sleep(350); // several polling rounds
  return tooltip.inner;
}

test("hovering a rail button adds its hotkey to the tooltip, once", async () => {
  const tooltip = await hoverRail(2, "Transform");
  assert.equal(tooltip.textContent, "Transform · Alt+3");
  assert.equal(tooltip.children.length, 1);
});

test("the fifth button gets Alt+5", async () => {
  assert.equal((await hoverRail(4, "Activity")).textContent, "Activity · Alt+5");
});

test("a tooltip with other text is left alone", async () => {
  assert.equal((await hoverRail(0, "Something else")).textContent, "Something else");
});

test("hovering something that is not a rail button adds nothing", async () => {
  assert.equal((await hoverRail(null, "Info")).textContent, "Info");
});

test("no hint when the position has no hotkey", async () => {
  const config = createDefaultConfig();
  config.hotkeys = config.hotkeys.filter((item) => item.key !== "alt+1");
  assert.equal((await hoverRail(0, "Info", config)).textContent, "Info");
});

test("a rebound rail hotkey is shown", async () => {
  const config = createDefaultConfig();
  config.hotkeys.find((item) => item.actionId === "action.rail1").key = "alt+shift+i";
  assert.equal((await hoverRail(0, "Info", config)).textContent, "Info · Alt+Shift+I");
});

// --- left navigation (Alt+Shift+1–9) ----------------------------------------------------

const NAV = ["Spaces", "Models", "Versions", "Dimensions", "Datasets", "Integrations"];

async function hoverNav(target, tooltipText, config = createDefaultConfig()) {
  const tooltip = createTooltip(tooltipText);
  const page = createPage({ tooltips: [tooltip] });
  const nav = NAV.map((name) => page.element(name));
  const rail = DATASET_RAIL.map((name) => page.element(name));
  const script = await loadContentScript(config, page, { rail, nav });
  script.hover(typeof target === "number" ? nav[target] : target);
  await sleep(350);
  return tooltip.inner;
}

test("hovering a left navigation link adds its Alt+Shift hotkey", async () => {
  assert.equal((await hoverNav(1, "Models")).textContent, "Models · Alt+Shift+2");
  assert.equal((await hoverNav(5, "Integrations")).textContent, "Integrations · Alt+Shift+6");
});

test("unnumbered sidebar buttons (Library, More, Help) get no hint", async () => {
  const page = createPage();
  assert.equal((await hoverNav(page.element("Library"), "Library")).textContent, "Library");
});

test("no nav hint when its hotkey was removed", async () => {
  const config = createDefaultConfig();
  config.hotkeys = config.hotkeys.filter((item) => item.key !== "alt+shift+1");
  assert.equal((await hoverNav(0, "Spaces", config)).textContent, "Spaces");
});
