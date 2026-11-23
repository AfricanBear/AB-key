import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createDefaultConfig, migrateConfig } from "../src/shared/config-schema.js";
import { CONFIG_KEY, loadV1Config, sleep } from "./helpers.mjs";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const SCRIPT = read("src/content/abacum-dataset-transform-link.js");
const STEP_SELECTOR = '[data-rfd-droppable-id="transformations-dnd-list"] [data-rfd-draggable-id]';

/** A fake Transform step (`<index>-<column>`); clicks are recorded in `clicks`. */
function step(id, clicks, { selected = false } = {}) {
  return {
    id,
    getAttribute: (name) => (name === "data-rfd-draggable-id" ? id : null),
    classList: { contains: (cls) => cls === "Mui-selected" && selected },
    scrollIntoView() {},
    click: () => clicks.push(id)
  };
}

/** A fake column header with its f chip (or a chip without the function icon). */
function header(column, { functionIcon = true } = {}) {
  const cell = { getAttribute: (name) => (name === "col-id" ? column : null) };
  const chip = {
    attrs: {},
    hasAttribute(name) {
      return name in this.attrs;
    },
    setAttribute(name, value) {
      this.attrs[name] = value;
    },
    removeAttribute(name) {
      delete this.attrs[name];
    },
    querySelector: (selector) => (selector === '[data-testid="function-icon"]' && functionIcon ? {} : null),
    closest: (selector) => (selector === ".ag-header-cell[col-id]" ? cell : null)
  };
  // Something inside the chip (the svg) and the header label next to it.
  const icon = { closest: (selector) => (selector === '[data-testid="testid-abax-chip"]' ? chip : null) };
  const label = { closest: () => null };
  return { icon, label, chip };
}

async function load({ config = createDefaultConfig(), steps = (clicks) => [] } = {}) {
  const clicks = [];
  let onClick = null;
  let onOver = null;
  let onChanged = null;
  const rootAttrs = {};
  const styles = new Map();
  const list = steps(clicks);
  const ctx = {
    Promise,
    setTimeout,
    document: {
      addEventListener: (type, fn) => {
        if (type === "click") onClick = fn;
        if (type === "pointerover") onOver = fn;
      },
      querySelectorAll: (selector) => (selector === STEP_SELECTOR ? list : []),
      getElementById: (id) => styles.get(id) || null,
      createElement: () => ({ id: "", textContent: "" }),
      head: { appendChild: (node) => styles.set(node.id, node) },
      documentElement: {
        setAttribute: (name, value) => (rootAttrs[name] = value),
        removeAttribute: (name) => delete rootAttrs[name]
      }
    },
    chrome: {
      storage: {
        local: { get: async () => ({ [CONFIG_KEY]: config }) },
        onChanged: { addListener: (fn) => (onChanged = fn) }
      }
    }
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(SCRIPT, ctx, { filename: "abacum-dataset-transform-link.js" });
  await sleep(10);
  return {
    clicks,
    rootAttrs,
    styles,
    hover: (target) => onOver({ target }),
    async click(target, button = 0) {
      onClick({ target, button });
      await sleep(10);
    },
    change: (newValue) => onChanged({ [CONFIG_KEY]: { newValue } }, "local")
  };
}

const steps = (clicks) => [
  step("0-cohorts", clicks),
  step("1-start_date", clicks),
  step("2-end_date", clicks),
  step("3-start_date", clicks),
  step("4-count", clicks, { selected: true })
];

test("f chip click selects the last step that writes the column", async () => {
  const page = await load({ steps });
  await page.click(header("start_date").icon);
  assert.deepEqual(page.clicks, ["3-start_date"]);
  await page.click(header("end_date").icon);
  assert.deepEqual(page.clicks, ["3-start_date", "2-end_date"]);
});

test("column names with dashes match the whole name after the index", async () => {
  const page = await load({ steps: (clicks) => [step("0-net-revenue", clicks), step("1-revenue", clicks)] });
  await page.click(header("net-revenue").icon);
  assert.deepEqual(page.clicks, ["0-net-revenue"]);
  await page.click(header("revenue").icon);
  assert.deepEqual(page.clicks, ["0-net-revenue", "1-revenue"]);
});

test("an already selected step, a column without steps or a closed panel do nothing", async () => {
  const page = await load({ steps });
  await page.click(header("count").icon);
  await page.click(header("period_tech").icon);
  assert.deepEqual(page.clicks, []);
  const closed = await load();
  await closed.click(header("start_date").icon);
  assert.deepEqual(closed.clicks, []);
});

test("other clicks are ignored: header label, a chip without the f icon, right button", async () => {
  const page = await load({ steps });
  await page.click(header("start_date").label);
  await page.click(header("start_date", { functionIcon: false }).icon);
  await page.click(header("start_date").icon, 2);
  await page.click(null);
  assert.deepEqual(page.clicks, []);
});

test("the Options toggle turns the link off and on in open tabs", async () => {
  const off = await load({ config: { ...createDefaultConfig(), datasetTransformLinkEnabled: false }, steps });
  await off.click(header("start_date").icon);
  assert.deepEqual(off.clicks, []);
  off.change({ ...createDefaultConfig(), datasetTransformLinkEnabled: true });
  await off.click(header("start_date").icon);
  assert.deepEqual(off.clicks, ["3-start_date"]);
  off.change({ ...createDefaultConfig(), datasetTransformLinkEnabled: false });
  await off.click(header("end_date").icon);
  assert.deepEqual(off.clicks, ["3-start_date"]);
});

test("config: enabled by default and after migrating old configs, user choice kept", () => {
  assert.equal(createDefaultConfig().datasetTransformLinkEnabled, true);
  assert.equal(migrateConfig(loadV1Config()).datasetTransformLinkEnabled, true);
  assert.equal(migrateConfig({ ...createDefaultConfig(), datasetTransformLinkEnabled: false }).datasetTransformLinkEnabled, false);
});

test("manifest loads the script on Abacum and Options has the toggle", () => {
  const manifest = JSON.parse(read("manifest.json"));
  const entry = manifest.content_scripts.find((cs) => cs.js.includes("src/content/abacum-dataset-transform-link.js"));
  assert.ok(entry);
  assert.deepEqual(entry.matches, ["*://*.abacum.io/*"]);
  assert.equal(entry.world, undefined);
  assert.match(read("src/options/options.html"), /id="datasetTransformLinkEnabled"/);
  const js = read("src/options/options.js");
  assert.match(js, /parsed\.datasetTransformLinkEnabled = datasetTransformLinkToggle\.checked/);
  assert.match(js, /datasetTransformLinkToggle\.checked = config\.datasetTransformLinkEnabled !== false/);
});

test("hover state: a style for the f chip, gated by an attribute on <html> that follows the toggle", async () => {
  const page = await load();
  assert.equal(page.rootAttrs["data-ab-key-transform-link"], "on");
  const css = page.styles.get("ab-key-transform-link-style").textContent;
  assert.match(css, /html\[data-ab-key-transform-link\] \.ag-header-cell\[col-id\] \[data-testid="testid-abax-chip"\]:has\(\[data-testid="function-icon"\]\):hover \{/);
  assert.match(css, /:active \{/);
  page.change({ ...createDefaultConfig(), datasetTransformLinkEnabled: false });
  assert.equal(page.rootAttrs["data-ab-key-transform-link"], undefined);
  page.change({ ...createDefaultConfig(), datasetTransformLinkEnabled: true });
  assert.equal(page.rootAttrs["data-ab-key-transform-link"], "on");
  assert.equal(page.styles.size, 1);

  const off = await load({ config: { ...createDefaultConfig(), datasetTransformLinkEnabled: false } });
  assert.equal(off.rootAttrs["data-ab-key-transform-link"], undefined);
});

test("tooltip on the f chip while on, taken back when switched off, others untouched", async () => {
  const page = await load();
  const { icon, label, chip } = header("start_date");
  page.hover(icon);
  assert.equal(chip.attrs.title, "Show transformation step");
  page.hover(label);
  const plain = header("start_date", { functionIcon: false });
  page.hover(plain.icon);
  assert.equal(plain.chip.attrs.title, undefined);

  page.change({ ...createDefaultConfig(), datasetTransformLinkEnabled: false });
  page.hover(icon);
  assert.equal(chip.attrs.title, undefined);

  // A title that is not ours is never removed.
  const other = header("end_date");
  other.chip.attrs.title = "Abacum";
  page.hover(other.icon);
  assert.equal(other.chip.attrs.title, "Abacum");
});

test("Options shows the f icon in the toggle text", () => {
  const html = read("src/options/options.html");
  assert.match(html, /id="datasetTransformLinkEnabled"[\s\S]*?<span class="fx-chip"[^>]*>f<\/span>/);
  assert.match(read("src/options/options.css"), /\.fx-chip \{[^}]*background: #dbeafe/);
});
