import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createDefaultConfig, migrateConfig } from "../src/shared/config-schema.js";
import { CONFIG_KEY, loadV1Config, sleep } from "./helpers.mjs";

const SCRIPT = fs.readFileSync(new URL("../src/content/abacum-dataset-range-sum.js", import.meta.url), "utf8");
const TOOLTIP_ID = "ab-key-range-selection-tooltip";

/**
 * Loads the script against a fake dataset grid.
 * cells: [{ text, row }] — the selected cells; rendered rows 0..renderedRows-1.
 */
async function load({ config = createDefaultConfig(), pathname = "/app/datasets/8439/manager", cells = [], renderedRows = 30, scroll = { top: 0, client: 600, height: 600 } } = {}) {
  const nodes = new Map();
  let onChanged = null;
  const viewport = { scrollTop: scroll.top, clientHeight: scroll.client, scrollHeight: scroll.height };
  const rows = Array.from({ length: renderedRows }, (_, index) => ({ getAttribute: () => String(index) }));
  const root = {
    querySelector: (selector) => (selector === ".ag-body-viewport" ? viewport : null),
    querySelectorAll: () => rows
  };
  const makeCells = (list) =>
    list.map(({ text, row = 0 }, index) => ({
      textContent: text,
      getBoundingClientRect: () => ({ right: 100 + index, bottom: 50 + row * 20, width: 80, height: 20 }),
      closest: (selector) => (selector === ".ag-root" ? root : { getAttribute: () => String(row) })
    }));
  let fakeCells = makeCells(cells);
  const document = {
    addEventListener() {},
    querySelectorAll: () => fakeCells,
    getElementById: (id) => nodes.get(id) || null,
    createElement: () => {
      const node = { id: "", style: {}, attrs: {}, innerHTML: "", offsetWidth: 140, offsetHeight: 70 };
      node.setAttribute = (key, value) => (node.attrs[key] = value);
      node.remove = () => nodes.delete(node.id);
      return node;
    },
    body: { appendChild: (node) => nodes.set(node.id, node) }
  };
  const ctx = {
    Promise,
    setTimeout,
    clearTimeout,
    Number,
    window: { location: { pathname }, innerWidth: 1600, innerHeight: 900 },
    document,
    chrome: {
      storage: {
        local: { get: async () => ({ [CONFIG_KEY]: config }) },
        onChanged: { addListener: (fn) => (onChanged = fn) }
      }
    }
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(SCRIPT, ctx, { filename: "abacum-dataset-range-sum.js" });
  await sleep(100); // config load + debounced first update
  const api = ctx.AbKeySelectionSum;
  return {
    api,
    tooltip: () => nodes.get(TOOLTIP_ID) || null,
    /** Changes the selection, as AG Grid would, and runs the script's update. */
    select: (list) => {
      fakeCells = makeCells(list);
      api.update();
    },
    toggle: async (value) => {
      onChanged({ [CONFIG_KEY]: { newValue: { ...config, datasetSelectionSumEnabled: value } } }, "local");
      await sleep(100);
    }
  };
}

// --- number parsing ----------------------------------------------------------------------

test("parses plain and thousands-separated numbers", async () => {
  const { api } = await load();
  assert.equal(api.parseNumber("13065.0"), 13065);
  assert.equal(api.parseNumber(" 210000.0 "), 210000);
  assert.equal(api.parseNumber("-1,234.5"), -1234.5);
  assert.equal(api.parseNumber("1,234,567"), 1234567);
  assert.equal(api.parseNumber("0.75"), 0.75);
});

test("skips dates, text, empty cells and malformed numbers", async () => {
  const { api } = await load();
  for (const text of ["2026-10-26", "Closed Won", "", "-", "12,34", "1.2.3", "€100", null]) {
    assert.equal(api.parseNumber(text), null, JSON.stringify(text));
  }
});

test("summarize counts only numeric cells", async () => {
  const { api } = await load();
  const summary = api.summarize(["13065.0", "11487.5", "Closed Won", "2026-10-26"]);
  assert.equal(summary.cells, 4);
  assert.equal(summary.count, 2);
  assert.equal(summary.sum, 24552.5);
  assert.equal(summary.avg, 12276.25);
});

test("formats with thousands separators and at most 2 decimals", async () => {
  const { api } = await load();
  assert.equal(api.formatNumber(24552.5), "24,552.5");
  assert.equal(api.formatNumber(1 / 3), "0.33");
  assert.equal(api.formatNumber(null), "–");
});

// --- tooltip -----------------------------------------------------------------------------

test("shows count, Sum and Avg for two or more selected cells", async () => {
  const page = await load({ cells: [{ text: "13065.0", row: 0 }, { text: "11487.5", row: 1 }] });
  const tooltip = page.tooltip();
  assert.ok(tooltip, "tooltip shown");
  assert.match(tooltip.innerHTML, /2 selected values/);
  assert.match(tooltip.innerHTML, /Sum<\/b> 24,552.5/);
  assert.match(tooltip.innerHTML, /Avg<\/b> 12,276.25/);
  assert.doesNotMatch(tooltip.innerHTML, /Visible rows only/);
  assert.equal(tooltip.attrs["data-testid"], "ab-key-range-selection-tooltip");
});

test("no tooltip for a single cell or a selection without numbers", async () => {
  assert.equal((await load({ cells: [{ text: "13065.0" }] })).tooltip(), null);
  assert.equal((await load({ cells: [{ text: "Closed Won" }, { text: "2026-10-26", row: 1 }] })).tooltip(), null);
});

test("no tooltip outside datasets (e.g. models have their own)", async () => {
  const page = await load({ pathname: "/app/modules/6158/edit", cells: [{ text: "1" }, { text: "2", row: 1 }] });
  assert.equal(page.tooltip(), null);
});

test("tooltip follows the selection and disappears when it is cleared", async () => {
  const page = await load({ cells: [{ text: "1" }, { text: "2", row: 1 }] });
  assert.match(page.tooltip().innerHTML, /Sum<\/b> 3/);
  page.select([{ text: "1" }, { text: "2", row: 1 }, { text: "4", row: 2 }]);
  assert.match(page.tooltip().innerHTML, /3 selected values/);
  assert.match(page.tooltip().innerHTML, /Sum<\/b> 7/);
  page.select([]);
  assert.equal(page.tooltip(), null);
});

test("marks the sum as partial when the selection reaches the last rendered row and the grid can scroll", async () => {
  const page = await load({
    cells: [{ text: "1", row: 28 }, { text: "2", row: 29 }],
    renderedRows: 30,
    scroll: { top: 0, client: 600, height: 5000 }
  });
  assert.match(page.tooltip().innerHTML, /Visible rows only/);
});

test("toggle off hides the tooltip; default is on, user choice kept by migration", async () => {
  assert.equal(createDefaultConfig().datasetSelectionSumEnabled, true);
  assert.equal(migrateConfig(loadV1Config()).datasetSelectionSumEnabled, true);
  assert.equal(migrateConfig({ ...createDefaultConfig(), datasetSelectionSumEnabled: false }).datasetSelectionSumEnabled, false);

  const page = await load({ cells: [{ text: "1" }, { text: "2", row: 1 }] });
  assert.ok(page.tooltip());
  await page.toggle(false);
  assert.equal(page.tooltip(), null);
  const off = await load({ config: { ...createDefaultConfig(), datasetSelectionSumEnabled: false }, cells: [{ text: "1" }, { text: "2", row: 1 }] });
  assert.equal(off.tooltip(), null);
});
