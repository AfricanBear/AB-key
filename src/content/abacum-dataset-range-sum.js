// Selection sum for Abacum datasets (Viewer tab).
//
// Abacum's dataset Viewer is an AG Grid with range selection but, unlike Models, shows no
// Sum/Avg for selected cells. When two or more cells are selected this script shows a small
// tooltip at the bottom-right of the selection: number of numeric values, Sum and Avg.
//
// - Selected cells: AG Grid classes ag-cell-range-selected* (stable AG Grid API classes).
// - Only datasets: pathname starts with /app/datasets (the Viewer tab does not change the URL).
// - Values are parsed strictly: "13065.0", "-1,234.5" are numbers; dates ("2026-10-26"),
//   text and empty cells are skipped.
// - AG Grid renders only rows near the viewport, so the sum covers rendered rows; when the
//   selection may continue beyond them the tooltip says "Visible rows only".
//
// Classic content script; toggle: config.datasetSelectionSumEnabled (Options page).
(function () {
  "use strict";

  if (globalThis.AbKeySelectionSum) return;

  const CONFIG_KEY = "mv3ClickAutomation.config"; // keep in sync with src/shared/config-schema.js
  const TOOLTIP_ID = "ab-key-range-selection-tooltip";
  const DATASET_PATH = "/app/datasets";
  const SELECTED_CELLS = ".ag-root .ag-cell[class*='ag-cell-range-selected']";
  const DEBOUNCE_MS = 60;
  const OFFSET_PX = 8;

  let enabled = true;
  let timer = null;

  // ---------------------------------------------------------------------------
  // Pure helpers (exported for tests)
  // ---------------------------------------------------------------------------

  const PLAIN_NUMBER = /^[-+]?\d+(\.\d+)?$/;
  const THOUSANDS_NUMBER = /^[-+]?\d{1,3}(,\d{3})+(\.\d+)?$/;

  function parseNumber(text) {
    const value = String(text ?? "").replace(/ /g, " ").trim();
    if (PLAIN_NUMBER.test(value)) return Number(value);
    if (THOUSANDS_NUMBER.test(value)) return Number(value.replace(/,/g, ""));
    return null;
  }

  /** texts: cell texts of the selection. */
  function summarize(texts) {
    const numbers = texts.map(parseNumber).filter((value) => value !== null);
    const sum = numbers.reduce((total, value) => total + value, 0);
    return {
      cells: texts.length,
      count: numbers.length,
      sum,
      avg: numbers.length ? sum / numbers.length : null
    };
  }

  function formatNumber(value) {
    if (value === null || !Number.isFinite(value)) return "–";
    const rounded = Math.round(value * 100) / 100;
    return rounded.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  // ---------------------------------------------------------------------------
  // DOM
  // ---------------------------------------------------------------------------

  function onDatasetPage() {
    return window.location.pathname.startsWith(DATASET_PATH);
  }

  function rowIndexOf(cell) {
    const value = Number(cell.closest?.("[row-index]")?.getAttribute("row-index"));
    return Number.isFinite(value) ? value : null;
  }

  // The selection may extend past the rendered rows if it touches the first/last rendered row
  // while the grid can still scroll in that direction.
  function mayBePartial(cells) {
    const root = cells[0]?.closest?.(".ag-root");
    const viewport = root?.querySelector(".ag-body-viewport");
    if (!root || !viewport) return false;
    const rendered = Array.from(root.querySelectorAll(".ag-center-cols-container .ag-row[row-index]"))
      .map((row) => Number(row.getAttribute("row-index")))
      .filter(Number.isFinite);
    const selected = cells.map(rowIndexOf).filter((value) => value !== null);
    if (!rendered.length || !selected.length) return false;
    const canScrollUp = viewport.scrollTop > 0;
    const canScrollDown = viewport.scrollTop + viewport.clientHeight < viewport.scrollHeight - 1;
    return (
      (canScrollUp && Math.min(...selected) <= Math.min(...rendered)) ||
      (canScrollDown && Math.max(...selected) >= Math.max(...rendered))
    );
  }

  function selectionRect(cells) {
    let right = -Infinity;
    let bottom = -Infinity;
    for (const cell of cells) {
      const rect = cell.getBoundingClientRect();
      if (!rect.width && !rect.height) continue;
      right = Math.max(right, rect.right);
      bottom = Math.max(bottom, rect.bottom);
    }
    return Number.isFinite(right) ? { right, bottom } : null;
  }

  function hideTooltip() {
    document.getElementById(TOOLTIP_ID)?.remove();
  }

  function renderTooltip(summary, partial, anchor) {
    let tooltip = document.getElementById(TOOLTIP_ID);
    if (!tooltip) {
      tooltip = document.createElement("div");
      tooltip.id = TOOLTIP_ID;
      tooltip.setAttribute("data-testid", TOOLTIP_ID);
      tooltip.setAttribute("role", "status");
      Object.assign(tooltip.style, {
        position: "fixed",
        zIndex: "2147483000",
        pointerEvents: "none",
        background: "rgba(23, 23, 23, 0.94)",
        color: "#ffffff",
        borderRadius: "8px",
        padding: "8px 12px",
        font: "12px/1.5 system-ui, -apple-system, 'Segoe UI', sans-serif",
        boxShadow: "0 4px 16px rgba(0, 0, 0, 0.25)",
        whiteSpace: "nowrap"
      });
      document.body.appendChild(tooltip);
    }

    const title = `${summary.count} selected value${summary.count === 1 ? "" : "s"}`;
    const lines = [
      `<div style="opacity:.7">${title}</div>`,
      `<div><b>Sum</b> ${formatNumber(summary.sum)}</div>`,
      `<div><b>Avg</b> ${formatNumber(summary.avg)}</div>`
    ];
    if (partial) lines.push('<div style="opacity:.7">Visible rows only</div>');
    tooltip.innerHTML = lines.join("");

    // Bottom-right of the selection, kept inside the viewport.
    const width = tooltip.offsetWidth || 140;
    const height = tooltip.offsetHeight || 70;
    const left = Math.min(anchor.right + OFFSET_PX, window.innerWidth - width - OFFSET_PX);
    const top = Math.min(anchor.bottom + OFFSET_PX, window.innerHeight - height - OFFSET_PX);
    tooltip.style.left = `${Math.max(OFFSET_PX, left)}px`;
    tooltip.style.top = `${Math.max(OFFSET_PX, top)}px`;
  }

  function update() {
    if (!enabled || !onDatasetPage()) {
      hideTooltip();
      return;
    }
    const cells = Array.from(document.querySelectorAll(SELECTED_CELLS));
    if (cells.length < 2) {
      hideTooltip();
      return;
    }
    const summary = summarize(cells.map((cell) => cell.textContent));
    const anchor = selectionRect(cells);
    if (!summary.count || !anchor) {
      hideTooltip();
      return;
    }
    renderTooltip(summary, mayBePartial(cells), anchor);
  }

  function schedule() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      update();
    }, DEBOUNCE_MS);
  }

  // ---------------------------------------------------------------------------
  // Wiring
  // ---------------------------------------------------------------------------

  document.addEventListener("pointerup", schedule, true);
  document.addEventListener("keyup", schedule, true);
  document.addEventListener("scroll", schedule, true);
  document.addEventListener(
    "pointermove",
    (event) => {
      if (event.buttons === 1) schedule(); // live update while drag-selecting
    },
    true
  );

  const isEnabled = (config) => config?.datasetSelectionSumEnabled !== false;

  chrome.storage.local
    .get(CONFIG_KEY)
    .then((data) => {
      enabled = isEnabled(data?.[CONFIG_KEY]);
      schedule();
    })
    .catch(() => {});

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[CONFIG_KEY]) return;
    enabled = isEnabled(changes[CONFIG_KEY].newValue);
    schedule();
  });

  globalThis.AbKeySelectionSum = Object.freeze({ parseNumber, summarize, formatNumber, update });
})();
