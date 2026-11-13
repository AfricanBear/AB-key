// Abacum left navigation (Alt+Shift+1–9): positional lookup.
//
// Positions count the section links after "Library", top to bottom (today: Spaces, Models,
// Versions, Dimensions, Datasets, Integrations). Only real in-app links count:
// - "More" is skipped: it opens a menu (it is wrapped in a link to the current page);
// - bottom items (What's new, Help & support, Settings) have no /app/ link.
// The list is read from the live DOM on every keypress, so new sections, or links that move
// out of "More", shift the positions without a code change.
//
// DOM (verified Nov 2026): button[data-testid="sidebar-section-button-<Name>"] inside
// a[href="/app/..."]; the link is clicked so React Router navigates.
//
// Classic script (no ES modules): exposes globalThis.AbKeySidebarNav for content-script.js.
(function () {
  "use strict";

  if (globalThis.AbKeySidebarNav) return;

  const BUTTON_PREFIX = "sidebar-section-button-";
  const ANCHOR_NAME = "Library";
  const EXCLUDED_NAMES = ["More"];
  const LINK_SELECTOR = "a[href^='/app/']";

  function nameOf(button) {
    return (button.getAttribute("data-testid") || "").slice(BUTTON_PREFIX.length);
  }

  function isVisible(element) {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  /** Section links after Library, top to bottom: [{ link, button, name, label }]. */
  function listLinks() {
    const buttons = Array.from(document.querySelectorAll(`[data-testid^="${BUTTON_PREFIX}"]`));
    const anchor = buttons.findIndex((button) => nameOf(button) === ANCHOR_NAME);
    if (anchor < 0) return [];
    const items = [];
    for (const button of buttons.slice(anchor + 1)) {
      const name = nameOf(button);
      if (EXCLUDED_NAMES.includes(name)) continue;
      const link = button.closest(LINK_SELECTOR);
      if (!link || !isVisible(link)) continue;
      const label = (button.getAttribute("aria-label") || name).trim();
      items.push({ link, button, name, label });
    }
    return items;
  }

  /** 1-based position. Returns { element, position, total }. */
  function getLink(position) {
    const items = listLinks();
    return { element: items[position - 1]?.link || null, position, total: items.length };
  }

  /** Labels of the links on the current page, in position order. */
  function describe() {
    return listLinks().map((item, index) => ({ position: index + 1, label: item.label, name: item.name }));
  }

  globalThis.AbKeySidebarNav = Object.freeze({ listLinks, getLink, describe });
})();
