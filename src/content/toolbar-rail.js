// Abacum right toolbar rail (Alt+1–5): positional lookup.
//
// The rail content differs by object type (Models, Dimensions, Datasets, Versions),
// so buttons are addressed by their visual position (top to bottom), never by label.
//
// Lookup order:
//   1. Buttons tagged by Abacum: [data-testid^="toolbar-rail-button-"] (stable, not hashed).
//   2. Geometric fallback: a strict vertical column of same-size icon buttons at the
//      right edge of the viewport (used only if Abacum renames the test ids).
// Excluded: the AI agent button that sits at the bottom of the same rail.
//
// Classic script (no ES modules): exposes globalThis.AbKeyToolbarRail for the other
// content scripts running in the same isolated world.
(function () {
  "use strict";

  if (globalThis.AbKeyToolbarRail) return;

  const TESTID_PREFIX = "toolbar-rail-button-";
  const EXCLUDED_TESTID_PARTS = ["ai-agent"];

  // Geometric fallback limits.
  const EDGE_ZONE_PX = 96; // button must start within this distance of the right edge
  const SIZE_MIN_PX = 20;
  const SIZE_MAX_PX = 48;
  const SIZE_TOLERANCE_PX = 2;
  const COLUMN_TOLERANCE_PX = 3; // same left offset
  const MAX_GAP_PX = 24; // gap between neighbouring buttons in the column
  const MIN_COLUMN_SIZE = 2;

  function isVisible(element) {
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const style = window.getComputedStyle(element);
    return style.visibility !== "hidden" && style.display !== "none";
  }

  function isExcluded(element) {
    const testId = element.getAttribute("data-testid") || "";
    return EXCLUDED_TESTID_PARTS.some((part) => testId.includes(part));
  }

  function byTop(a, b) {
    return a.getBoundingClientRect().top - b.getBoundingClientRect().top;
  }

  function findByTestId() {
    return Array.from(document.querySelectorAll(`button[data-testid^="${TESTID_PREFIX}"]`))
      .filter((button) => !isExcluded(button) && isVisible(button))
      .sort(byTop);
  }

  function findByGeometry() {
    const viewportRight = document.documentElement.clientWidth || window.innerWidth;
    const pool = Array.from(document.querySelectorAll("button, [role='button']")).filter((element) => {
      if (isExcluded(element) || !isVisible(element)) return false;
      const rect = element.getBoundingClientRect();
      return (
        rect.left >= viewportRight - EDGE_ZONE_PX &&
        rect.width >= SIZE_MIN_PX &&
        rect.width <= SIZE_MAX_PX &&
        Math.abs(rect.width - rect.height) <= SIZE_TOLERANCE_PX
      );
    });
    if (pool.length < MIN_COLUMN_SIZE) return [];

    // Group buttons that share the same left edge and size, then keep only runs
    // of buttons stacked tightly from the top: that is the rail.
    const columns = [];
    for (const element of pool.sort(byTop)) {
      const rect = element.getBoundingClientRect();
      const column = columns.find(
        (c) =>
          Math.abs(c.left - rect.left) <= COLUMN_TOLERANCE_PX &&
          Math.abs(c.width - rect.width) <= SIZE_TOLERANCE_PX &&
          rect.top - c.bottom <= MAX_GAP_PX
      );
      if (column) {
        column.items.push(element);
        column.bottom = rect.bottom;
      } else {
        columns.push({ left: rect.left, width: rect.width, bottom: rect.bottom, top: rect.top, items: [element] });
      }
    }
    const candidates = columns.filter((c) => c.items.length >= MIN_COLUMN_SIZE);
    if (!candidates.length) return [];
    candidates.sort((a, b) => a.top - b.top || b.items.length - a.items.length);
    return candidates[0].items;
  }

  /** Returns { buttons, source } with rail buttons sorted top to bottom. */
  function listButtons() {
    const tagged = findByTestId();
    if (tagged.length) return { buttons: tagged, source: "testid" };
    const geometric = findByGeometry();
    if (geometric.length) return { buttons: geometric, source: "geometry" };
    return { buttons: [], source: "none" };
  }

  /** 1-based position. Returns { element, position, source, total } or null. */
  function getButton(position) {
    const { buttons, source } = listButtons();
    const element = buttons[position - 1];
    if (!element) return { element: null, position, source, total: buttons.length };
    return { element, position, source, total: buttons.length };
  }

  function labelOf(element) {
    const aria = element.getAttribute("aria-label");
    if (aria && aria.trim()) return aria.trim();
    const title = element.getAttribute("title");
    if (title && title.trim()) return title.trim();
    const text = (element.textContent || "").replace(/\s+/g, " ").trim();
    return text || null;
  }

  /** Labels of the rail buttons on the current page, top to bottom. */
  function describe() {
    const { buttons, source } = listButtons();
    return {
      source,
      buttons: buttons.map((element, index) => ({
        position: index + 1,
        label: labelOf(element),
        testId: element.getAttribute("data-testid") || null,
        active: element.getAttribute("data-active") === "true"
      }))
    };
  }

  globalThis.AbKeyToolbarRail = Object.freeze({ listButtons, getButton, describe, labelOf });
})();
