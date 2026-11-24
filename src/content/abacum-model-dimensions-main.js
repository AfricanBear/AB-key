// Dimensions under each variable in the model builder — page-world part.
//
// Abacum's builder has "Show Builder Formulas" / "Show Builder Values" toggles but nothing that
// shows a variable's dimensions (Library → Variables has an "Active Dimensions" column). The grid
// row data of every variable carries `dimensions` (an array of names), reachable only in the page
// world through the React fiber of .ag-root-wrapper — hence "world": "MAIN" and no chrome.* here.
//
// - A third toggle button is cloned from "Show Builder Values" (same MUI classes, aria-pressed)
//   and placed right after it, with the icon of the right rail's Dimensions button. A click asks
//   the isolated script (TOGGLE_EVENT) to flip the shared shown / hidden switch.
// - Shown: purple chips under the name of every variable row (first MAX_CHIPS, then "+N"; hovering
//   "+N" pops up the rest, one per line; "no dimensions" when empty). Variable rows get EXTRA_PX more height
//   through the grid's getRowHeight option (Abacum sets only rowHeight, so its density still
//   applies); hidden restores Abacum's option and removes the chips.
// - The state comes from the data-ab-key-model-dims attribute on <html> (see
//   abacum-model-dimensions.js); absent = feature off.
(function () {
  "use strict";

  if (globalThis.AbKeyModelDimensionsMain) return;

  const ATTR = "data-ab-key-model-dims"; // keep in sync with abacum-model-dimensions.js
  const TOGGLE_EVENT = "ab-key:model-dims-toggle"; // keep in sync with abacum-model-dimensions.js
  const VALUES_BUTTON = 'button[aria-label="Show Builder Values"]';
  const RAIL_DIMENSIONS_ICON = 'button[data-testid="toolbar-rail-button-module-dimensions"] svg';
  const BUTTON_LABEL = "Show Builder Dimensions";
  const BUTTON_MARK = "data-ab-key-model-dims-button";
  const CHIPS_CLASS = "ab-key-model-dims";
  const CELL_CLASS = "ab-key-model-dims-cell";
  const STYLE_ID = "ab-key-model-dims-style";
  const MORE_CLASS = "ab-key-more";
  const POPUP_CLASS = "ab-key-model-dims-popup";
  const MAX_CHIPS = 3;
  const EXTRA_PX = 22;
  const MAX_FIBER_DEPTH = 40;
  const MAX_HOOKS = 40;

  const stateOf = () => document.documentElement.getAttribute(ATTR); // null | "hidden" | "shown"
  const isModelPage = () => /^\/app\/modules(\/|$)/.test(location.pathname);

  // --- Pure helpers (exported for tests) -------------------------------------------------------

  /** What to draw for a dimensions list: up to max chips, the rest as "+N" with a hover popup. */
  function chipModel(dimensions, max = MAX_CHIPS) {
    const names = Array.isArray(dimensions) ? dimensions.filter((name) => typeof name === "string" && name) : [];
    return {
      shown: names.slice(0, max),
      hidden: names.slice(max),
      more: Math.max(0, names.length - max),
      empty: names.length === 0
    };
  }

  /** A variable row (its data has a dimensions array); dimension and group rows are not. */
  const isVariableData = (data) => Boolean(data) && Array.isArray(data.dimensions);

  /** getRowHeight for the shown state: variable rows get extra room, others keep the default. */
  function rowHeightFor(baseHeight) {
    return (params) => (isVariableData(params && params.data) ? baseHeight() + EXTRA_PX : undefined);
  }

  // --- Grid api -----------------------------------------------------------------------------

  const isApi = (value) =>
    Boolean(value) &&
    typeof value === "object" &&
    typeof value.getGridOption === "function" &&
    typeof value.setGridOption === "function" &&
    typeof value.getDisplayedRowAtIndex === "function";

  function apiFromValue(value) {
    if (isApi(value)) return value;
    if (value && typeof value === "object") {
      if (isApi(value.current)) return value.current;
      if (isApi(value.api)) return value.api;
    }
    return null;
  }

  function apiOf(root) {
    const key = Object.keys(root).find((name) => name.startsWith("__reactFiber"));
    let fiber = key ? root[key] : null;
    for (let depth = 0; fiber && depth < MAX_FIBER_DEPTH; depth += 1, fiber = fiber.return) {
      const props = fiber.memoizedProps;
      if (props && typeof props === "object") {
        for (const name of Object.keys(props)) {
          const api = apiFromValue(props[name]);
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

  /** The builder grid: the .ag-root-wrapper that has variable rows. */
  function builderGrid() {
    for (const root of document.querySelectorAll(".ag-root-wrapper")) {
      if (!root.querySelector(".ag-row.variable-row")) continue;
      const api = apiOf(root);
      if (api) return { root, api };
    }
    return null;
  }

  // --- Row height -----------------------------------------------------------------------------

  const tallApis = new WeakSet();

  function setTall(api, tall) {
    if (tall === tallApis.has(api)) return;
    if (tall) {
      api.setGridOption("getRowHeight", rowHeightFor(() => Number(api.getGridOption("rowHeight")) || 32));
      tallApis.add(api);
    } else {
      api.setGridOption("getRowHeight", undefined);
      tallApis.delete(api);
    }
    if (typeof api.resetRowHeights === "function") api.resetRowHeights();
  }

  // --- Chips ----------------------------------------------------------------------------------

  function ensureStyle() {
    if (!document.head || document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    // Abacum's name block fills the whole cell and centres the name: in a tall row it is
    // squeezed to the top part, and the chips sit in the strip below it.
    style.textContent =
      `.${CELL_CLASS}>[data-testid="drag-and-drop-cell"]{height:calc(100% - ${EXTRA_PX}px)!important}` +
      `.${CHIPS_CLASS}{position:absolute;left:28px;right:4px;bottom:4px;display:flex;flex-wrap:nowrap;` +
      `gap:4px;overflow:hidden;line-height:16px;height:16px;align-items:center}` +
      `.${CHIPS_CLASS} span{font-size:11px;padding:0 6px;border-radius:9px;white-space:nowrap;` +
      `background:#EEEDFE;color:#3C3489}` +
      `.${CHIPS_CLASS} .ab-key-more{background:transparent;color:#534AB7;padding:0 2px}` +
      `.${CHIPS_CLASS} .ab-key-none{background:transparent;color:#888780;padding:0}` +
      `.${CHIPS_CLASS} .${MORE_CLASS}{cursor:default}` +
      // Popup for "+N": looks like Abacum's MUI tooltips, lives in <body> (the cell clips).
      `.${POPUP_CLASS}{position:fixed;z-index:1500;pointer-events:none;max-width:320px;` +
      `background:rgba(97,97,97,.95);color:#fff;font-size:11px;line-height:16px;padding:4px 8px;` +
      `border-radius:4px;font-family:inherit;box-shadow:0 2px 6px rgba(0,0,0,.2)}` +
      `.${POPUP_CLASS} div{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}`;
    document.head.appendChild(style);
  }

  function chipsElement(model) {
    const box = document.createElement("div");
    box.className = CHIPS_CLASS;
    const add = (text, cls) => {
      const span = document.createElement("span");
      span.textContent = text;
      if (cls) span.className = cls;
      box.appendChild(span);
      return span;
    };
    if (model.empty) add("no dimensions", "ab-key-none");
    for (const name of model.shown) add(name).title = name;
    if (model.more) add(`+${model.more}`, MORE_CLASS).dataset.names = JSON.stringify(model.hidden);
    return box;
  }

  // --- "+N" popup -----------------------------------------------------------------------------

  function hidePopup() {
    for (const el of document.querySelectorAll(`.${POPUP_CLASS}`)) el.remove();
  }

  /** Shows the dimensions hidden behind a "+N" chip right under it (above if no room below). */
  function showPopup(more) {
    hidePopup();
    let names = [];
    try {
      names = JSON.parse(more.dataset.names || "[]");
    } catch {
      return null;
    }
    if (!Array.isArray(names) || !names.length || !document.body) return null;
    const popup = document.createElement("div");
    popup.className = POPUP_CLASS;
    popup.setAttribute("role", "tooltip");
    for (const name of names) {
      const line = document.createElement("div");
      line.textContent = name;
      popup.appendChild(line);
    }
    document.body.appendChild(popup);
    const anchor = more.getBoundingClientRect();
    const size = popup.getBoundingClientRect();
    const viewWidth = document.documentElement.clientWidth || 0;
    const viewHeight = document.documentElement.clientHeight || 0;
    const below = anchor.bottom + 4;
    const top = below + size.height > viewHeight && anchor.top - 4 - size.height >= 0 ? anchor.top - 4 - size.height : below;
    const left = Math.max(4, Math.min(anchor.left, viewWidth - size.width - 4));
    popup.style.top = `${Math.round(top)}px`;
    popup.style.left = `${Math.round(left)}px`;
    return popup;
  }

  const moreChipOf = (target) =>
    target && typeof target.closest === "function" ? target.closest(`.${CHIPS_CLASS} .${MORE_CLASS}`) : null;

  document.addEventListener("mouseover", (event) => {
    const more = moreChipOf(event.target);
    if (more && !moreChipOf(event.relatedTarget)) showPopup(more);
  });
  document.addEventListener("mouseout", (event) => {
    if (moreChipOf(event.target) && !moreChipOf(event.relatedTarget)) hidePopup();
  });
  // The grid scrolls under a still mouse: the popup would float away from its chip.
  document.addEventListener("scroll", hidePopup, true);

  function removeChips() {
    hidePopup();
    for (const el of document.querySelectorAll(`.${CHIPS_CLASS}`)) el.remove();
    for (const el of document.querySelectorAll(`.${CELL_CLASS}`)) el.classList.remove(CELL_CLASS);
  }

  function renderChips(grid) {
    ensureStyle();
    for (const cell of grid.root.querySelectorAll('.ag-row.variable-row [col-id="name"]')) {
      const row = cell.closest(".ag-row");
      const node = grid.api.getDisplayedRowAtIndex(Number(row.getAttribute("row-index")));
      const data = node && node.data;
      const existing = cell.querySelector(`:scope > .${CHIPS_CLASS}`);
      if (!isVariableData(data)) {
        if (existing) existing.remove();
        cell.classList.remove(CELL_CLASS);
        continue;
      }
      cell.classList.add(CELL_CLASS);
      const key = data.dimensions.join("\u0001") || "\u0000";
      if (existing && existing.dataset.key === key) continue;
      if (existing) existing.remove();
      const box = chipsElement(chipModel(data.dimensions));
      box.dataset.key = key;
      cell.appendChild(box);
    }
  }

  // --- Button ---------------------------------------------------------------------------------

  function updateButton(shown) {
    const values = document.querySelector(VALUES_BUTTON);
    let button = document.querySelector(`button[${BUTTON_MARK}]`);
    if (!values) return;
    if (!button) {
      button = values.cloneNode(false);
      button.setAttribute(BUTTON_MARK, "");
      button.setAttribute("aria-label", BUTTON_LABEL);
      button.title = "Show dimensions (AB-key)";
      const icon = document.querySelector(RAIL_DIMENSIONS_ICON);
      if (icon) {
        const svg = icon.cloneNode(true);
        svg.removeAttribute("aria-label");
        svg.setAttribute("aria-hidden", "true");
        button.appendChild(svg);
      } else {
        button.textContent = "D";
      }
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        document.dispatchEvent(new CustomEvent(TOGGLE_EVENT));
      });
    }
    if (button.previousElementSibling !== values) values.after(button);
    button.setAttribute("aria-pressed", shown ? "true" : "false");
  }

  function removeButton() {
    const button = document.querySelector(`button[${BUTTON_MARK}]`);
    if (button) button.remove();
  }

  // --- Update loop ----------------------------------------------------------------------------

  let scheduled = false;
  let lastGridApi = null;

  function update() {
    scheduled = false;
    const state = isModelPage() ? stateOf() : null;
    if (!state) {
      removeButton();
      removeChips();
      if (lastGridApi) setTall(lastGridApi, false);
      return;
    }
    const shown = state === "shown";
    updateButton(shown);
    const grid = builderGrid();
    if (lastGridApi && (!grid || grid.api !== lastGridApi)) setTall(lastGridApi, false);
    lastGridApi = grid ? grid.api : null;
    if (!grid) return;
    setTall(grid.api, shown);
    if (shown) renderChips(grid);
    else removeChips();
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(update);
  }

  const observer = new MutationObserver((records) => {
    // Our own chips, popup and button changes do not need another pass.
    const ours = records.every((record) =>
      [...record.addedNodes, ...record.removedNodes].every(
        (node) => node.nodeType === 1 && (node.classList.contains(CHIPS_CLASS) || node.classList.contains(POPUP_CLASS) || node.hasAttribute(BUTTON_MARK))
      )
    );
    if (!ours || records.some((record) => record.type === "attributes")) schedule();
  });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: [ATTR] });
  if (document.body) observer.observe(document.body, { childList: true, subtree: true });
  schedule();

  globalThis.AbKeyModelDimensionsMain = { chipModel, showPopup, hidePopup, rowHeightFor, isVariableData, EXTRA_PX, MAX_CHIPS, ATTR, TOGGLE_EVENT };
})();
