// Pinned columns, column widths and two-row headers for Abacum dataset Viewer.
//
// Abacum's dataset Viewer is an AG Grid where only the service column (row type + checkbox) is
// pinned left; data columns have lockPinned, so they cannot be pinned from the UI, and widths
// reset whenever the grid is re-created (e.g. Loads -> Viewer).
//
// This script adds a pin button to each data column header (visible on hover, always visible
// when the column is pinned), remembers per dataset which columns are pinned and the widths the
// user set, and asks the page-world bridge (abacum-dataset-columns-main.js) to apply them each
// time the Viewer grid appears. Everything stays in chrome.storage.local of this browser.
//
// - Viewer grid: .ag-root-wrapper with the "_abacum_type" column (the Loads tab has none).
// - Dataset id: /app/datasets/<id>/... (the Viewer tab does not change the URL).
// - Pinned columns keep the grid's order (we never move columns).
// - Pinning is refused when pinned columns would take more than MAX_PINNED_SHARE of the grid.
// - The pin sits just left of Abacum's header buttons (filter, options), measured on every pass.
//
// Two-row headers: the header is twice as tall (the bridge sets AG Grid's headerHeight); row 1 is
// the type icon, name and sort arrow, row 2 the pin, filter and options buttons, always visible.
// Scoped by attributes on the Viewer grid: data-ab-key-pins, data-ab-key-two-row.
//
// Classic content script; toggles: config.datasetPinColumnsEnabled and
// config.datasetTwoRowHeaderEnabled (Options page).
(function () {
  "use strict";

  if (globalThis.AbKeyDatasetColumns) return;

  const CONFIG_KEY = "mv3ClickAutomation.config"; // keep in sync with src/shared/config-schema.js
  const STORE_KEY = "abKey.datasetColumns"; // keep in sync with src/options/options.js
  const APPLY_EVENT = "ab-key:dataset-columns-apply";
  const RESIZED_EVENT = "ab-key:dataset-columns-resized";
  const TYPE_COLUMN = "_abacum_type";
  const SERVICE_PREFIX = "_abacum";
  const BUTTON_CLASS = "ab-key-pin-button";
  const STYLE_ID = "ab-key-pin-style";
  const TOAST_ID = "ab-key-pin-toast";
  const MAX_PINNED_SHARE = 0.6;
  const PINS_ATTR = "data-ab-key-pins";
  const TWO_ROW_ATTR = "data-ab-key-two-row";
  const HEADER = '[data-testid="custom-column-header"]';
  const PIN_GAP_PX = 2;
  const THROTTLE_MS = 150;
  const TOAST_MS = 2500;
  // Material "push_pin" (Apache 2.0).
  const PIN_PATH =
    "M16 9V4h1c.55 0 1-.45 1-1s-.45-1-1-1H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3z";

  const CSS = `
.${BUTTON_CLASS} {
  position: absolute; top: 50%; transform: translateY(-50%); z-index: 2;
  display: flex; align-items: center; justify-content: center;
  width: 20px; height: 20px; padding: 0; border: 0; border-radius: 4px;
  background: var(--ag-header-background-color, #fff); color: #9e9e9e;
  cursor: pointer; opacity: 0; transition: opacity .12s;
}
.ag-header-cell:hover .${BUTTON_CLASS}, .${BUTTON_CLASS}:focus-visible, .${BUTTON_CLASS}[aria-pressed="true"] { opacity: 1; }
.${BUTTON_CLASS}:hover { color: #424242; background: rgba(0, 0, 0, .06); }
.${BUTTON_CLASS}[aria-pressed="true"] { color: #5b3fd9; }
.${BUTTON_CLASS} svg { width: 14px; height: 14px; fill: currentColor; pointer-events: none; }
.${BUTTON_CLASS}[aria-pressed="false"] svg { transform: rotate(45deg); }
/* one row: keep the name clear of the pin */
.ag-root-wrapper[${PINS_ATTR}]:not([${TWO_ROW_ATTR}]) ${HEADER} > .ag-header-cell-label { margin-right: 22px; }
/* two rows: name on top, buttons below and always visible */
.ag-root-wrapper[${TWO_ROW_ATTR}] ${HEADER} {
  display: grid !important; grid-template-columns: 1fr auto auto; grid-template-rows: 1fr 1fr; align-items: center;
}
.ag-root-wrapper[${TWO_ROW_ATTR}] ${HEADER} > .ag-header-cell-label { grid-row: 1; grid-column: 1 / -1; min-width: 0; margin-right: 0; }
.ag-root-wrapper[${TWO_ROW_ATTR}] ${HEADER} > .ag-header-cell-menu-button { grid-row: 2; opacity: 1 !important; }
.ag-root-wrapper[${TWO_ROW_ATTR}] ${HEADER} > .ag-header-cell-menu-button:nth-child(1) { grid-column: 3; }
.ag-root-wrapper[${TWO_ROW_ATTR}] ${HEADER} > .ag-header-cell-menu-button:nth-child(2) { grid-column: 2; }
.ag-root-wrapper[${TWO_ROW_ATTR}] .${BUTTON_CLASS} { top: 75%; opacity: 1; }
`;

  let pinsEnabled = false; // until the config is read
  let twoRowEnabled = false;
  let store = {}; // { [datasetId]: { pinned: [colId], widths: { colId: px } } }
  let lastRoot = null;
  let timer = null;
  let observer = null;
  let toastTimer = null;

  // ---------------------------------------------------------------------------
  // Pure helpers (exported for tests)
  // ---------------------------------------------------------------------------

  function datasetIdFromPath(pathname) {
    const match = /^\/app\/datasets\/([^/]+)/.exec(String(pathname || ""));
    return match ? match[1] : null;
  }

  function entryOf(all, datasetId) {
    const entry = all?.[datasetId];
    return {
      pinned: Array.isArray(entry?.pinned) ? entry.pinned.filter((id) => typeof id === "string") : [],
      widths: entry?.widths && typeof entry.widths === "object" ? { ...entry.widths } : {}
    };
  }

  /** Returns a new store with colId pinned or unpinned for the dataset. */
  function togglePinned(all, datasetId, colId) {
    const entry = entryOf(all, datasetId);
    entry.pinned = entry.pinned.includes(colId) ? entry.pinned.filter((id) => id !== colId) : [...entry.pinned, colId];
    return withEntry(all, datasetId, entry);
  }

  /** Returns a new store with the given widths merged into the dataset. */
  function mergeWidths(all, datasetId, widths) {
    const entry = entryOf(all, datasetId);
    for (const [colId, width] of Object.entries(widths || {})) {
      if (typeof colId === "string" && !colId.startsWith(SERVICE_PREFIX) && Number.isFinite(width) && width > 0) {
        entry.widths[colId] = Math.round(width);
      }
    }
    return withEntry(all, datasetId, entry);
  }

  function withEntry(all, datasetId, entry) {
    const next = { ...(all || {}) };
    if (!entry.pinned.length && !Object.keys(entry.widths).length) delete next[datasetId];
    else next[datasetId] = entry;
    return next;
  }

  /** Distance from the cell's right edge to the left of Abacum's header buttons, plus a gap. */
  function pinRightOffset(cellRight, buttonLefts) {
    const lefts = (buttonLefts || []).filter(Number.isFinite);
    return lefts.length ? Math.max(0, Math.round(cellRight - Math.min(...lefts))) + PIN_GAP_PX : 4;
  }

  /** Whether one more column of `columnWidth` fits next to `pinnedWidth` in a grid of `gridWidth`. */
  function canPin(pinnedWidth, columnWidth, gridWidth) {
    if (!(gridWidth > 0)) return true;
    return pinnedWidth + columnWidth <= gridWidth * MAX_PINNED_SHARE;
  }

  // ---------------------------------------------------------------------------
  // DOM
  // ---------------------------------------------------------------------------

  const currentDatasetId = () => datasetIdFromPath(window.location.pathname);

  function viewerRoot() {
    if (!currentDatasetId()) return null;
    for (const root of document.querySelectorAll(".ag-root-wrapper")) {
      if (root.querySelector(`.ag-header-cell[col-id="${TYPE_COLUMN}"]`)) return root;
    }
    return null;
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = CSS;
    (document.head || document.documentElement).appendChild(style);
  }

  const active = () => pinsEnabled || twoRowEnabled;

  function removeButtons() {
    for (const button of document.querySelectorAll(`.${BUTTON_CLASS}`)) button.remove();
  }

  function removeUi() {
    document.getElementById(STYLE_ID)?.remove();
    document.getElementById(TOAST_ID)?.remove();
    removeButtons();
    for (const root of document.querySelectorAll(".ag-root-wrapper")) {
      root.removeAttribute(PINS_ATTR);
      root.removeAttribute(TWO_ROW_ATTR);
    }
  }

  function markRoot(root) {
    const set = (name, on) => {
      if (on && !root.hasAttribute(name)) root.setAttribute(name, "");
      if (!on && root.hasAttribute(name)) root.removeAttribute(name);
    };
    set(PINS_ATTR, pinsEnabled);
    set(TWO_ROW_ATTR, twoRowEnabled);
  }

  function showToast(text) {
    let toast = document.getElementById(TOAST_ID);
    if (!toast) {
      toast = document.createElement("div");
      toast.id = TOAST_ID;
      toast.setAttribute("role", "status");
      Object.assign(toast.style, {
        position: "fixed",
        right: "16px",
        bottom: "16px",
        zIndex: "2147483000",
        background: "rgba(23, 23, 23, 0.94)",
        color: "#ffffff",
        borderRadius: "8px",
        padding: "8px 12px",
        font: "12px/1.5 system-ui, -apple-system, 'Segoe UI', sans-serif",
        boxShadow: "0 4px 16px rgba(0, 0, 0, 0.25)",
        pointerEvents: "none"
      });
      document.body.appendChild(toast);
    }
    toast.textContent = text;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.remove(), TOAST_MS);
  }

  function sendApply() {
    const datasetId = currentDatasetId();
    if (!datasetId) return;
    const { pinned, widths } = pinsEnabled ? entryOf(store, datasetId) : { pinned: [], widths: {} };
    const detail = JSON.stringify({ pinned, widths, doubleHeader: twoRowEnabled });
    document.dispatchEvent(new CustomEvent(APPLY_EVENT, { detail }));
  }

  function save(next) {
    store = next;
    chrome.storage.local.set({ [STORE_KEY]: next }).catch(() => {});
  }

  function onPinClick(event) {
    event.preventDefault();
    event.stopPropagation();
    const button = event.currentTarget;
    const cell = button.closest(".ag-header-cell");
    const colId = cell?.getAttribute("col-id");
    const datasetId = currentDatasetId();
    if (!colId || !datasetId) return;
    const pinning = !entryOf(store, datasetId).pinned.includes(colId);
    if (pinning) {
      const root = cell.closest(".ag-root-wrapper");
      const pinnedWidth = root?.querySelector(".ag-pinned-left-header")?.getBoundingClientRect().width || 0;
      const columnWidth = cell.getBoundingClientRect().width || 0;
      const gridWidth = root?.getBoundingClientRect().width || 0;
      if (!canPin(pinnedWidth, columnWidth, gridWidth)) {
        showToast("Not enough room to pin this column. Unpin or narrow another one first.");
        return;
      }
    }
    save(togglePinned(store, datasetId, colId));
    sendApply();
    update();
  }

  // AG Grid starts a column drag on mousedown anywhere in the header cell.
  const stop = (event) => event.stopPropagation();

  function createButton() {
    const button = document.createElement("button");
    button.type = "button";
    button.className = BUTTON_CLASS;
    button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${PIN_PATH}"></path></svg>`;
    button.addEventListener("click", onPinClick);
    for (const type of ["pointerdown", "mousedown", "touchstart", "dblclick"]) button.addEventListener(type, stop);
    return button;
  }

  function decorate(root, datasetId) {
    const pinned = entryOf(store, datasetId).pinned;
    for (const cell of root.querySelectorAll(".ag-header-cell[col-id]")) {
      const colId = cell.getAttribute("col-id");
      if (!colId || colId.startsWith(SERVICE_PREFIX)) continue;
      let button = cell.querySelector(`:scope > .${BUTTON_CLASS}`);
      if (!button) {
        button = createButton();
        cell.appendChild(button);
      }
      const lefts = Array.from(cell.querySelectorAll(".ag-header-cell-menu-button"), (menu) => menu.getBoundingClientRect())
        .filter((rect) => rect.width > 0)
        .map((rect) => rect.left);
      const right = `${pinRightOffset(cell.getBoundingClientRect().right, lefts)}px`;
      if (button.style.right !== right) button.style.right = right;
      const isPinned = pinned.includes(colId);
      const label = isPinned ? "Unpin column" : "Pin column left";
      if (button.getAttribute("aria-pressed") !== String(isPinned)) button.setAttribute("aria-pressed", String(isPinned));
      if (button.getAttribute("title") !== label) {
        button.setAttribute("title", label);
        button.setAttribute("aria-label", label);
      }
    }
  }

  function update() {
    const root = active() ? viewerRoot() : null;
    if (!root) {
      lastRoot = null;
      return;
    }
    ensureStyle();
    markRoot(root);
    if (root !== lastRoot) {
      lastRoot = root;
      sendApply(); // new grid (page load, Loads -> Viewer, another dataset): restore state
    }
    if (pinsEnabled) decorate(root, currentDatasetId());
    else removeButtons();
  }

  // Throttled, not debounced: Abacum mutates the DOM continuously while the grid scrolls.
  function schedule() {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      update();
    }, THROTTLE_MS);
  }

  function applyConfig(config) {
    const nextPins = config?.datasetPinColumnsEnabled !== false;
    const nextTwoRow = config?.datasetTwoRowHeaderEnabled !== false;
    const wasActive = active();
    if (nextPins === pinsEnabled && nextTwoRow === twoRowEnabled && (observer || !wasActive)) return;
    pinsEnabled = nextPins;
    twoRowEnabled = nextTwoRow;
    if (active()) {
      if (!observer) {
        observer = new MutationObserver(() => {
          if (currentDatasetId()) schedule();
        });
        observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
      }
      if (wasActive) sendApply(); // same grid, new settings
      update();
    } else {
      observer?.disconnect();
      observer = null;
      lastRoot = null;
      if (wasActive) {
        sendApply(); // unpin and restore Abacum's header height; widths stay until the grid is re-created
        removeUi();
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Wiring
  // ---------------------------------------------------------------------------

  document.addEventListener(RESIZED_EVENT, (event) => {
    const datasetId = currentDatasetId();
    if (!pinsEnabled || !datasetId) return;
    try {
      const data = JSON.parse(event.detail);
      save(mergeWidths(store, datasetId, data?.widths));
    } catch {
      // ignore malformed events
    }
  });

  chrome.storage.local
    .get([CONFIG_KEY, STORE_KEY])
    .then((data) => {
      store = data?.[STORE_KEY] || {};
      applyConfig(data?.[CONFIG_KEY]);
    })
    .catch(() => {});

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes[STORE_KEY]) {
      const next = changes[STORE_KEY].newValue || {};
      const datasetId = currentDatasetId();
      const changedHere = datasetId && JSON.stringify(entryOf(next, datasetId)) !== JSON.stringify(entryOf(store, datasetId));
      store = next;
      if (changedHere && pinsEnabled) {
        sendApply(); // e.g. reset from Options or another tab
        schedule();
      }
    }
    if (changes[CONFIG_KEY]) applyConfig(changes[CONFIG_KEY].newValue);
  });

  globalThis.AbKeyDatasetColumns = Object.freeze({ datasetIdFromPath, togglePinned, mergeWidths, canPin, pinRightOffset, entryOf, update });
})();
