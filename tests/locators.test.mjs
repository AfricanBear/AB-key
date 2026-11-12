import { test } from "node:test";
import assert from "node:assert/strict";
import { createDefaultConfig, migrateConfig } from "../src/shared/config-schema.js";
import { createPage, loadContentScript, sleep } from "./helpers.mjs";

const BULK = "[data-testid='testid-builder-bulk-dimensions']";
const DIALOG_SAVE = "[role='dialog'] .MuiButton-containedPrimary";
const BUILDER_SAVE = "[data-testid='testid-builder-save-button']";
const GENERIC_SAVE = ".MuiButton-root.MuiButton-containedPrimary";
const ADD_BUTTON = "[data-testid='testid-builder-add-button-anywhere']";
const ADD_MENU_ITEMS = "[data-testid='testid-builder-add-dropdown-anywhere'] [role='menuitem']";

async function pressOn(page, code, { config = createDefaultConfig(), rail = [], wait = 400 } = {}) {
  const script = await loadContentScript(config, page, { rail });
  script.press(code, code.slice(-1).toLowerCase());
  await sleep(wait);
  return page.clicks;
}

// --- Alt+1-5: toolbar rail, by position -------------------------------------------------

test("Alt+N clicks the N-th rail button", async () => {
  const page = createPage();
  const rail = ["Info", "Scheduler", "Transform", "Data usage", "Activity"].map((name) => page.element(name));
  assert.deepEqual(await pressOn(page, "Digit3", { rail }), ["Transform"]);
});

test("Alt+N clicks nothing when the rail has fewer than N buttons", async () => {
  const page = createPage({ dom: { "*": [] } });
  const rail = [page.element("Info"), page.element("Activity")];
  assert.deepEqual(await pressOn(page, "Digit4", { rail, wait: 1700 }), []);
});

// --- Alt+E: Edit Dimensions ------------------------------------------------------------

test("Alt+E clicks the bulk-dimensions button", async () => {
  const page = createPage();
  page.dom[BULK] = [page.element("Edit dimensions")];
  page.dom["*"] = [page.element("Show Builder Formulas", { role: "button" })];
  assert.deepEqual(await pressOn(page, "KeyE"), ["Edit dimensions"]);
});

test("Alt+E clicks nothing when its button is missing (regression: 'Show Builder Formulas')", async () => {
  const page = createPage();
  page.dom["*"] = [page.element("Show Builder Formulas", { role: "button" }), page.element("Show Builder Values", { role: "button" })];
  // the old v2 locator with a role-only aria criterion must not match random buttons either
  const v2 = migrateConfig(createDefaultConfig());
  v2.actions.find((item) => item.actionId === "action.bulkDimensions").locatorProfile.ariaCriteria = { role: "button", caseSensitive: false };
  assert.deepEqual(await pressOn(page, "KeyE", { config: v2, wait: 2300 }), []);
});

test("Alt+E does not click a button covered by a modal", async () => {
  const page = createPage();
  page.dom[BULK] = [page.element("Edit dimensions", { covered: true })];
  assert.deepEqual(await pressOn(page, "KeyE", { wait: 2300 }), []);
});

// --- Alt+S: Save ---------------------------------------------------------------------------

test("Alt+S prefers Save in an open dialog over the builder Save behind it", async () => {
  const page = createPage();
  const dialogSave = page.element("dialog Save", { text: "Save" });
  const builderSave = page.element("builder Save", { text: "Save", covered: true });
  Object.assign(page.dom, { [DIALOG_SAVE]: [dialogSave], [BUILDER_SAVE]: [builderSave], [GENERIC_SAVE]: [builderSave, dialogSave] });
  assert.deepEqual(await pressOn(page, "KeyS"), ["dialog Save"]);
});

test("Alt+S ignores a primary dialog button that is not Save", async () => {
  const page = createPage();
  Object.assign(page.dom, {
    [DIALOG_SAVE]: [page.element("Delete")],
    [BUILDER_SAVE]: [page.element("builder Save", { text: "Save" })]
  });
  assert.deepEqual(await pressOn(page, "KeyS"), ["builder Save"]);
});

test("Alt+S uses the builder Save button when no dialog is open", async () => {
  const page = createPage();
  Object.assign(page.dom, {
    [BUILDER_SAVE]: [page.element("builder Save", { text: "Save" })],
    [GENERIC_SAVE]: [page.element("other Save", { text: "Save" })]
  });
  assert.deepEqual(await pressOn(page, "KeyS"), ["builder Save"]);
});

test("Alt+S falls back to the generic search on other pages", async () => {
  const page = createPage({ pathname: "/app/datasets/8439/manager" });
  page.dom[GENERIC_SAVE] = [page.element("dataset Save", { text: "Save" })];
  assert.deepEqual(await pressOn(page, "KeyS"), ["dataset Save"]);
});

// --- Alt+A: "+" then Create variable -----------------------------------------------------

test("Alt+A clicks '+' then exactly 'Create variable', whatever the menu order", async () => {
  const page = createPage();
  const items = ["Create group", "Create section", "Create variable"].map((name) => page.element(name, { role: "menuitem" }));
  Object.assign(page.dom, { [ADD_BUTTON]: [page.element("+", { text: "" })], [ADD_MENU_ITEMS]: items, ".MuiMenuItem-root": items });
  assert.deepEqual(await pressOn(page, "KeyA"), ["+", "Create variable"]);
});
