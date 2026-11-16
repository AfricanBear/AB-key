// Pinned columns and column widths for Abacum dataset Viewer — page-world bridge.
//
// Runs in the page's MAIN world ("world": "MAIN" in the manifest) because only there the AG Grid
// api object is reachable. It has no chrome.* access and no observers: it acts only on requests
// from the isolated script abacum-dataset-columns.js and reports user resizes back to it.
//
// Protocol (CustomEvent on document, detail is a JSON string so it crosses the world boundary):
// - "ab-key:dataset-columns-apply"   isolated -> page  { pinned: [colId], widths: { colId: px } }
// - "ab-key:dataset-columns-resized" page -> isolated  { widths: { colId: px } }
//
// The api is found by walking up the React fiber of the Viewer grid (.ag-root-wrapper that has
// the "_abacum_type" column) to the first hook/prop exposing applyColumnState. Abacum sets
// lockPinned on data columns, which only blocks pinning from the UI; applyColumnState still pins.
// Pinning and resizing are local: Abacum has no onColumnPinned/onColumnResized handlers, and
// we never move columns (Abacum's onColumnMoved may persist the order).
(function () {
  "use strict";

  if (globalThis.AbKeyDatasetColumnsMain) return;

  const APPLY_EVENT = "ab-key:dataset-columns-apply";
  const RESIZED_EVENT = "ab-key:dataset-columns-resized";
  const TYPE_COLUMN = "_abacum_type";
  const SERVICE_PREFIX = "_abacum";
  const MAX_FIBER_DEPTH = 40;
  const MAX_HOOKS = 40;
  const RETRY_MS = 250;
  const MAX_RETRIES = 20;

  const wired = new WeakSet();
  let desired = null; // last { pinned, widths } requested by the isolated script
  let retryTimer = null;

  // ---------------------------------------------------------------------------
  // Pure helpers (exported for tests)
  // ---------------------------------------------------------------------------

  const isApi = (value) =>
    Boolean(value) && typeof value === "object" && typeof value.applyColumnState === "function" && typeof value.getColumnState === "function";

  function apiFromValue(value) {
    if (isApi(value)) return value;
    if (value && typeof value === "object") {
      if (isApi(value.current)) return value.current;
      if (isApi(value.api)) return value.api;
    }
    return null;
  }

  /** Walks up a React fiber looking for a grid api in props or hook state. */
  function findApiInFiber(fiber) {
    for (let depth = 0; fiber && depth < MAX_FIBER_DEPTH; depth += 1, fiber = fiber.return) {
      const props = fiber.memoizedProps;
      if (props && typeof props === "object") {
        for (const key of Object.keys(props)) {
          const api = apiFromValue(props[key]);
          if (api) return api;
        }
      }
      let hook = fiber.memoizedState;
      for (let index = 0; hook && typeof hook === "object" && index < MAX_HOOKS; index += 1, hook = hook.next) {
        const api = apiFromValue(hook.memoizedState);
        if (api) return api;
      }
    }
    return null;
  }

  /**
   * The minimal column state to apply: pin/unpin data columns to match `pinned`, and set stored
   * widths that differ. Service columns (_abacum_*) are never touched. Order is never changed.
   */
  function buildColumnState(current, pinned, widths) {
    const pinnedSet = new Set(pinned || []);
    const state = [];
    for (const column of current || []) {
      const colId = column.colId;
      if (!colId || colId.startsWith(SERVICE_PREFIX)) continue;
      const item = { colId };
      const wantPinned = pinnedSet.has(colId) ? "left" : null;
      if ((column.pinned || null) !== wantPinned) item.pinned = wantPinned;
      const width = widths?.[colId];
      if (Number.isFinite(width) && width > 0 && Math.round(width) !== Math.round(column.width)) item.width = Math.round(width);
      if (Object.keys(item).length > 1) state.push(item);
    }
    return state;
  }

  // ---------------------------------------------------------------------------
  // Page
  // ---------------------------------------------------------------------------

  function viewerRoot() {
    for (const root of document.querySelectorAll(".ag-root-wrapper")) {
      if (root.querySelector(`.ag-header-cell[col-id="${TYPE_COLUMN}"]`)) return root;
    }
    return null;
  }

  function findApi() {
    const root = viewerRoot();
    if (!root) return null;
    const key = Object.keys(root).find((name) => name.startsWith("__reactFiber$"));
    return key ? findApiInFiber(root[key]) : null;
  }

  function report(widths) {
    document.dispatchEvent(new CustomEvent(RESIZED_EVENT, { detail: JSON.stringify({ widths }) }));
  }

  function wire(api) {
    if (wired.has(api) || typeof api.addEventListener !== "function") return;
    wired.add(api);
    api.addEventListener("columnResized", (event) => {
      if (!event?.finished) return;
      const source = String(event.source || "");
      if (!source.startsWith("ui") && !source.startsWith("autosize")) return; // ours are "api"
      const widths = {};
      for (const column of event.columns || (event.column ? [event.column] : [])) {
        const colId = column?.getColId?.();
        const width = column?.getActualWidth?.();
        if (colId && !colId.startsWith(SERVICE_PREFIX) && Number.isFinite(width)) widths[colId] = Math.round(width);
      }
      if (Object.keys(widths).length) report(widths);
    });
    // Abacum may reload column definitions (e.g. after a data load); restore our state then.
    api.addEventListener("newColumnsLoaded", () => setTimeout(() => apply(0), 0));
  }

  function apply(attempt = 0) {
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
    if (!desired) return;
    const api = findApi();
    const current = api ? api.getColumnState() : [];
    if (!api || !current.some((column) => !column.colId.startsWith(SERVICE_PREFIX))) {
      if (attempt < MAX_RETRIES) retryTimer = setTimeout(() => apply(attempt + 1), RETRY_MS);
      return;
    }
    wire(api);
    const state = buildColumnState(current, desired.pinned, desired.widths);
    if (state.length) api.applyColumnState({ state });
  }

  document.addEventListener(APPLY_EVENT, (event) => {
    try {
      const data = JSON.parse(event.detail);
      desired = { pinned: Array.isArray(data?.pinned) ? data.pinned : [], widths: data?.widths || {} };
    } catch {
      return;
    }
    apply(0);
  });

  globalThis.AbKeyDatasetColumnsMain = Object.freeze({ findApiInFiber, buildColumnState });
})();
