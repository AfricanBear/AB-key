import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createDefaultConfig, migrateConfig } from "../src/shared/config-schema.js";
import { CONFIG_KEY, loadV1Config, sleep } from "./helpers.mjs";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const SCRIPT = read("src/content/abacum-dataset-columns.js");
const MAIN_SCRIPT = read("src/content/abacum-dataset-columns-main.js");
const manifest = JSON.parse(read("manifest.json"));
const STORE_KEY = "abKey.datasetColumns";
const APPLY_EVENT = "ab-key:dataset-columns-apply";
const RESIZED_EVENT = "ab-key:dataset-columns-resized";
const DATASET = "ds-1";
const PATH = `/app/datasets/${DATASET}/manager`;
const WAIT = 200; // > THROTTLE_MS

class FakeCustomEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.detail = init.detail;
  }
}

// --- fake Viewer grid ---------------------------------------------------------------------

function createGrid({ columns = ["_abacum_type", "date", "employee", "salary", "_abacum_status"], width = 1000, pinnedWidth = 64, columnWidth = 200 } = {}) {
  const root = { cells: [], pinnedWidth, width };
  root.cells = columns.map((colId) => {
    const cell = {
      colId,
      children: [],
      getAttribute: (name) => (name === "col-id" ? colId : null),
      getBoundingClientRect: () => ({ width: columnWidth }),
      querySelector: (selector) => (selector.includes("ab-key-pin-button") ? cell.children.find((child) => child.isConnected) || null : null),
      querySelectorAll: (selector) => (selector === ".ag-header-cell-menu-button" ? [{}, {}] : []),
      appendChild(child) {
        child.parent = cell;
        child.isConnected = true;
        cell.children.push(child);
      },
      closest: (selector) => (selector === ".ag-root-wrapper" ? root : null)
    };
    return cell;
  });
  root.querySelector = (selector) => {
    if (selector === '.ag-header-cell[col-id="_abacum_type"]') return root.cells.find((cell) => cell.colId === "_abacum_type") || null;
    if (selector === ".ag-pinned-left-header") return { getBoundingClientRect: () => ({ width: root.pinnedWidth }) };
    return null;
  };
  root.querySelectorAll = (selector) => (selector === ".ag-header-cell[col-id]" ? root.cells : []);
  root.getBoundingClientRect = () => ({ width: root.width });
  root.button = (colId) => root.cells.find((cell) => cell.colId === colId)?.children.find((child) => child.isConnected) || null;
  return root;
}

async function load({ config = createDefaultConfig(), stored = {}, pathname = PATH, grid = createGrid() } = {}) {
  const sent = [];
  const nodes = new Map();
  const listeners = {};
  const observers = [];
  let onChanged = null;
  let roots = grid ? [grid] : [];
  const storage = { [CONFIG_KEY]: config, [STORE_KEY]: stored };

  function element() {
    const handlers = {};
    const node = {
      id: "",
      style: {},
      attrs: {},
      isConnected: false,
      setAttribute: (key, value) => (node.attrs[key] = String(value)),
      getAttribute: (key) => (key in node.attrs ? node.attrs[key] : null),
      addEventListener: (type, fn) => (handlers[type] = fn),
      closest: (selector) => (selector === ".ag-header-cell" ? node.parent : null),
      remove: () => {
        node.isConnected = false;
        nodes.delete(node.id);
      },
      fire(type) {
        const event = { type, currentTarget: node, stopped: false, preventDefault() {}, stopPropagation() { this.stopped = true; } };
        handlers[type]?.(event);
        return event;
      }
    };
    return node;
  }

  const document = {
    head: { appendChild: (node) => nodes.set(node.id, node) },
    body: { appendChild: (node) => nodes.set(node.id, node) },
    documentElement: {},
    addEventListener: (type, fn) => (listeners[type] = fn),
    dispatchEvent: (event) => sent.push({ type: event.type, detail: JSON.parse(event.detail) }),
    getElementById: (id) => nodes.get(id) || null,
    createElement: () => element(),
    querySelectorAll: (selector) => {
      if (selector === ".ag-root-wrapper") return roots;
      if (selector === ".ab-key-pin-button") return roots.flatMap((root) => root.cells.flatMap((cell) => cell.children.filter((child) => child.isConnected)));
      return [];
    }
  };
  class FakeObserver {
    constructor(callback) {
      this.callback = callback;
      observers.push(this);
    }
    observe() {
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
    Number,
    JSON,
    window: { location: { pathname } },
    document,
    CustomEvent: FakeCustomEvent,
    MutationObserver: FakeObserver,
    chrome: {
      storage: {
        local: {
          get: async () => structuredClone(storage),
          set: async (items) => Object.assign(storage, structuredClone(items))
        },
        onChanged: { addListener: (fn) => (onChanged = fn) }
      }
    }
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(SCRIPT, ctx, { filename: "abacum-dataset-columns.js" });
  await sleep(WAIT);

  return {
    api: ctx.AbKeyDatasetColumns,
    grid,
    sent,
    storage,
    observers,
    nodes,
    applies: () => sent.filter((event) => event.type === APPLY_EVENT).map((event) => event.detail),
    /** Abacum re-renders: the observer fires and the throttled update runs. */
    mutate: async (nextRoots) => {
      if (nextRoots) roots = nextRoots;
      observers.forEach((observer) => observer.active && observer.callback([]));
      await sleep(WAIT);
    },
    resized: (widths) => listeners[RESIZED_EVENT]({ detail: JSON.stringify({ widths }) }),
    setConfig: async (value) => {
      storage[CONFIG_KEY] = value;
      onChanged({ [CONFIG_KEY]: { newValue: value } }, "local");
      await sleep(WAIT);
    },
    setStore: async (value) => {
      storage[STORE_KEY] = value;
      onChanged({ [STORE_KEY]: { newValue: value } }, "local");
      await sleep(WAIT);
    }
  };
}

// --- pure helpers -------------------------------------------------------------------------

test("dataset id comes from /app/datasets/<id>/...", async () => {
  const { api } = await load({ grid: null });
  assert.equal(api.datasetIdFromPath("/app/datasets/abc-1/manager"), "abc-1");
  assert.equal(api.datasetIdFromPath("/app/datasets"), null);
  assert.equal(api.datasetIdFromPath("/app/modules/m1/edit"), null);
});

test("togglePinned appends in click order, unpins, and drops empty datasets", async () => {
  const { api } = await load({ grid: null });
  let store = api.togglePinned({}, "a", "date");
  store = api.togglePinned(store, "a", "employee");
  assert.deepEqual([...store.a.pinned], ["date", "employee"]);
  store = api.togglePinned(store, "a", "date");
  assert.deepEqual([...store.a.pinned], ["employee"]);
  store = api.togglePinned(store, "a", "employee");
  assert.deepEqual(Object.keys(store), []);
});

test("mergeWidths keeps data columns with positive widths only", async () => {
  const { api } = await load({ grid: null });
  const store = api.mergeWidths({ a: { pinned: ["date"], widths: { date: 100 } } }, "a", { employee: 331.4, _abacum_type: 90, bad: -1, nan: NaN });
  assert.deepEqual(JSON.parse(JSON.stringify(store.a)), { pinned: ["date"], widths: { date: 100, employee: 331 } });
});

test("canPin refuses when pinned columns would take more than 60% of the grid", async () => {
  const { api } = await load({ grid: null });
  assert.equal(api.canPin(64, 200, 1000), true);
  assert.equal(api.canPin(464, 200, 1000), false);
  assert.equal(api.canPin(0, 200, 0), true, "unknown grid width does not block");
});

// --- header buttons -----------------------------------------------------------------------

test("adds a pin button to data columns only and restores the dataset's state", async () => {
  const stored = { [DATASET]: { pinned: ["employee"], widths: { salary: 150 } }, other: { pinned: ["x"], widths: {} } };
  const page = await load({ stored });
  assert.equal(page.grid.button("_abacum_type"), null);
  assert.equal(page.grid.button("_abacum_status"), null);
  assert.equal(page.grid.button("date").attrs["aria-pressed"], "false");
  assert.equal(page.grid.button("employee").attrs["aria-pressed"], "true");
  assert.equal(page.grid.button("employee").attrs.title, "Unpin column");
  assert.equal(page.grid.button("date").style.right, "50px", "left of the two menu buttons");
  assert.ok(page.nodes.get("ab-key-pin-style"), "styles injected");
  assert.deepEqual(page.applies(), [{ pinned: ["employee"], widths: { salary: 150 } }]);
});

test("clicking the pin pins and unpins the column, saves it and asks the page to apply", async () => {
  const page = await load();
  const click = page.grid.button("date").fire("click");
  assert.ok(click.stopped, "the header does not sort");
  assert.deepEqual(page.storage[STORE_KEY][DATASET].pinned, ["date"]);
  assert.deepEqual(page.applies().at(-1), { pinned: ["date"], widths: {} });
  assert.equal(page.grid.button("date").attrs["aria-pressed"], "true");

  page.grid.button("date").fire("click");
  assert.equal(page.storage[STORE_KEY][DATASET], undefined);
  assert.deepEqual(page.applies().at(-1), { pinned: [], widths: {} });
  assert.equal(page.grid.button("date").attrs["aria-pressed"], "false");
});

test("mousedown on the pin does not start AG Grid's column drag", async () => {
  const page = await load();
  assert.ok(page.grid.button("date").fire("mousedown").stopped);
  assert.ok(page.grid.button("date").fire("pointerdown").stopped);
});

test("pinning is refused with a toast when there is no room", async () => {
  const grid = createGrid({ pinnedWidth: 464 });
  const page = await load({ grid });
  const before = page.applies().length;
  grid.button("salary").fire("click");
  assert.equal(page.storage[STORE_KEY][DATASET], undefined);
  assert.equal(page.applies().length, before);
  assert.match(page.nodes.get("ab-key-pin-toast").textContent, /Not enough room/);
});

test("widths reported by the page are remembered per dataset", async () => {
  const page = await load();
  page.resized({ employee: 331 });
  page.resized({ date: 120.6 });
  assert.deepEqual(page.storage[STORE_KEY][DATASET], { pinned: [], widths: { employee: 331, date: 121 } });
});

test("state is re-applied when the grid is re-created, not on every mutation", async () => {
  const page = await load({ stored: { [DATASET]: { pinned: ["date"], widths: {} } } });
  assert.equal(page.applies().length, 1);
  await page.mutate();
  assert.equal(page.applies().length, 1, "same grid");
  const fresh = createGrid(); // Loads -> Viewer
  await page.mutate([fresh]);
  assert.equal(page.applies().length, 2);
  assert.equal(fresh.button("date").attrs["aria-pressed"], "true");
});

test("reset from Options unpins on open tabs", async () => {
  const page = await load({ stored: { [DATASET]: { pinned: ["date"], widths: {} } } });
  await page.setStore(undefined);
  assert.deepEqual(page.applies().at(-1), { pinned: [], widths: {} });
  assert.equal(page.grid.button("date").attrs["aria-pressed"], "false");
});

test("ignores the Loads grid (no _abacum_type column) and pages outside datasets", async () => {
  const loads = await load({ grid: createGrid({ columns: ["file", "status"] }) });
  assert.equal(loads.grid.button("file"), null);
  assert.equal(loads.applies().length, 0);
  const model = await load({ pathname: "/app/modules/m1/edit" });
  assert.equal(model.grid.button("date"), null);
  assert.equal(model.applies().length, 0);
});

test("toggle: default on, user choice kept; off unpins, removes buttons and the observer", async () => {
  assert.equal(createDefaultConfig().datasetPinColumnsEnabled, true);
  assert.equal(migrateConfig(loadV1Config()).datasetPinColumnsEnabled, true);
  assert.equal(migrateConfig({ ...createDefaultConfig(), datasetPinColumnsEnabled: false }).datasetPinColumnsEnabled, false);

  const page = await load({ stored: { [DATASET]: { pinned: ["date"], widths: {} } } });
  await page.setConfig({ ...createDefaultConfig(), datasetPinColumnsEnabled: false });
  assert.deepEqual(page.applies().at(-1), { pinned: [], widths: {} });
  assert.equal(page.grid.button("date"), null);
  assert.equal(page.observers.filter((observer) => observer.active).length, 0);
  assert.deepEqual(page.storage[STORE_KEY][DATASET].pinned, ["date"], "stored state is kept");

  const off = await load({ config: { ...createDefaultConfig(), datasetPinColumnsEnabled: false } });
  assert.equal(off.observers.length, 0);
  assert.equal(off.grid.button("date"), null);
  assert.equal(off.applies().length, 0);
});

// --- page-world bridge --------------------------------------------------------------------

function createGridApi(columns) {
  const listeners = {};
  const applied = [];
  return {
    applied,
    listeners,
    getColumnState: () => columns.map((column) => ({ ...column })),
    applyColumnState: ({ state }) => {
      applied.push(state);
      for (const item of state) Object.assign(columns.find((column) => column.colId === item.colId), item);
    },
    addEventListener: (type, fn) => (listeners[type] = fn)
  };
}

function loadMain({ gridApi, fiberDepth = 4 } = {}) {
  const sent = [];
  const listeners = {};
  let fiber = { memoizedProps: { children: [] }, memoizedState: null, return: null };
  const top = fiber;
  for (let i = 0; i < fiberDepth; i += 1) {
    const parent = { memoizedProps: {}, memoizedState: null, return: null };
    fiber.return = parent;
    fiber = parent;
  }
  if (gridApi) fiber.memoizedState = { memoizedState: { current: gridApi }, next: { memoizedState: 1, next: null } };
  const root = { querySelector: (selector) => (selector.includes("_abacum_type") ? {} : null), "__reactFiber$abc": top };
  const ctx = {
    setTimeout,
    clearTimeout,
    JSON,
    Number,
    String,
    Object,
    Array,
    Math,
    CustomEvent: FakeCustomEvent,
    document: {
      querySelectorAll: () => [root],
      addEventListener: (type, fn) => (listeners[type] = fn),
      dispatchEvent: (event) => sent.push({ type: event.type, detail: JSON.parse(event.detail) })
    }
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(MAIN_SCRIPT, ctx, { filename: "abacum-dataset-columns-main.js" });
  return {
    main: ctx.AbKeyDatasetColumnsMain,
    sent,
    request: (data) => listeners[APPLY_EVENT]({ detail: JSON.stringify(data) })
  };
}

const COLUMNS = () => [
  { colId: "_abacum_type", pinned: "left", width: 64 },
  { colId: "date", pinned: null, width: 200 },
  { colId: "employee", pinned: null, width: 200 },
  { colId: "salary", pinned: "left", width: 200 },
  { colId: "_abacum_status", pinned: "right", width: 40 }
];

test("bridge: builds the minimal state and never touches service columns or order", () => {
  const { main } = loadMain();
  const state = main.buildColumnState(COLUMNS(), ["date"], { employee: 331, _abacum_type: 10, date: 200 });
  assert.deepEqual(JSON.parse(JSON.stringify(state)), [
    { colId: "date", pinned: "left" },
    { colId: "employee", width: 331 },
    { colId: "salary", pinned: null }
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(main.buildColumnState(COLUMNS(), ["salary"], {}))), []);
});

test("bridge: finds the grid api in React hook state and gives up past the depth limit", () => {
  const gridApi = createGridApi(COLUMNS());
  const near = loadMain({ gridApi });
  let fiber = { return: null };
  const top = fiber;
  for (let i = 0; i < 4; i += 1) fiber = fiber.return = { return: null };
  fiber.memoizedState = { memoizedState: { current: gridApi }, next: null };
  assert.equal(near.main.findApiInFiber(top), gridApi);
  assert.equal(near.main.findApiInFiber({ memoizedProps: { gridApi: { api: gridApi } } }), gridApi);
  let deep = { return: null };
  const deepTop = deep;
  for (let i = 0; i < 50; i += 1) deep = deep.return = { return: null };
  deep.memoizedState = { memoizedState: gridApi, next: null };
  assert.equal(near.main.findApiInFiber(deepTop), null);
});

test("bridge: applies requests, reports user resizes and restores after new columns", async () => {
  const gridApi = createGridApi(COLUMNS());
  const page = loadMain({ gridApi });
  page.request({ pinned: ["date"], widths: { employee: 300 } });
  assert.deepEqual(JSON.parse(JSON.stringify(gridApi.applied)), [[
    { colId: "date", pinned: "left" },
    { colId: "employee", width: 300 },
    { colId: "salary", pinned: null }
  ]]);

  const column = (colId, width) => ({ getColId: () => colId, getActualWidth: () => width });
  gridApi.listeners.columnResized({ finished: false, source: "uiColumnResized", columns: [column("date", 210)] });
  gridApi.listeners.columnResized({ finished: true, source: "api", columns: [column("date", 220)] });
  gridApi.listeners.columnResized({ finished: true, source: "uiColumnResized", columns: [column("date", 230.4), column("_abacum_type", 70)] });
  assert.deepEqual(page.sent, [{ type: RESIZED_EVENT, detail: { widths: { date: 230 } } }]);

  // Abacum reloads column definitions and resets the grid.
  gridApi.applyColumnState({ state: [{ colId: "date", pinned: null }] });
  gridApi.applied.length = 0;
  gridApi.listeners.newColumnsLoaded();
  await sleep(10);
  assert.deepEqual(JSON.parse(JSON.stringify(gridApi.applied)), [[{ colId: "date", pinned: "left" }]]);
});

test("manifest: the bridge runs in the MAIN world on Abacum only and uses no chrome.* APIs", () => {
  const entry = manifest.content_scripts.find((item) => item.js.includes("src/content/abacum-dataset-columns-main.js"));
  assert.equal(entry.world, "MAIN");
  assert.deepEqual(entry.matches, ["*://*.abacum.io/*"]);
  const code = MAIN_SCRIPT.replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(code, /chrome\./);
  assert.doesNotMatch(code, /MutationObserver|setInterval/);
  const isolated = manifest.content_scripts.find((item) => item.js.includes("src/content/abacum-dataset-columns.js"));
  assert.equal(isolated.world, undefined);
});
