// Light theme for Abacum's left navigation (Options → Features, off by default).
//
// Abacum's sidebar is dark purple with white icons. This script makes the 48px icon column
// light, the icons dark, and highlights the current section in lavender.
//
// Only stable anchors are used (verified Nov 2026) — hashed css-xxxx classes changed in an
// Abacum release and broke the previous version:
// - [data-testid="sidebar"]: the left MUI Drawer (the right drawer is not touched);
// - [data-testid^="sidebar-section-button-"]: nav buttons; icons use currentColor;
// - the logo is the only <img> box in the sidebar.
// Abacum marks the current section only with a hashed class, so the script marks it itself
// (data-ab-key-nav-active) by comparing the URL with each section link (/app/<section>).
//
// Work happens only while the feature is on: <head> is watched (React may drop our <style>,
// and the <title> changes on every in-app navigation), plus popstate.
//
// Classic content script.
(function () {
  "use strict";

  if (globalThis.AbKeyLightNav) return;

  const CONFIG_KEY = "mv3ClickAutomation.config";
  const STYLE_ID = "ab-key-light-nav-styles";
  const ROOT_ATTR = "data-ab-key-light-nav";
  const ACTIVE_ATTR = "data-ab-key-nav-active";

  const SIDEBAR = '[data-testid="sidebar"]';
  const NAV_BUTTON = '[data-testid^="sidebar-section-button-"]';
  const SECTION_LINK = "a[href^='/app/']";
  const NAV_PREFIX = "sidebar-section-button-";
  // Wrapped in a link to the current page, so their href is not a section of its own.
  const NOT_SECTIONS = ["Search", "More"];

  const ICON = "#302048";
  const ACTIVE_BG = "#b8a8d8";
  const HOVER_BG = "rgba(48, 32, 72, 0.08)";

  function buildCss() {
    return `
/* AB-key light theme nav (stable selectors only) */
${SIDEBAR} .MuiDrawer-paper {
  background-color: transparent !important;
  background-image: linear-gradient(to right, rgb(255 255 255) 0px, rgb(254 254 254) 48px, transparent 48px, transparent 100%) !important;
  border-right: none !important;
}

${SIDEBAR} .MuiDrawer-paper div:has(> img) {
  background-color: #ffffff !important;
  border-color: rgba(186, 168, 230, 0.35) !important;
}

${SIDEBAR} ${NAV_BUTTON},
${SIDEBAR} ${NAV_BUTTON} svg {
  color: ${ICON} !important;
  fill: ${ICON} !important;
}

${SIDEBAR} ${NAV_BUTTON} {
  background-color: transparent !important;
}

${SIDEBAR} ${NAV_BUTTON}:hover {
  background-color: ${HOVER_BG} !important;
}

${SIDEBAR} ${NAV_BUTTON}[${ACTIVE_ATTR}] {
  background-color: ${ACTIVE_BG} !important;
}
`;
  }

  // ---------------------------------------------------------------------------
  // Current section (exported for tests)
  // ---------------------------------------------------------------------------

  /** "/app/spaces" for a section link; null for deeper links (/app/spaces/<id>). */
  function sectionPath(href) {
    let path;
    try {
      path = new URL(href, "https://app.abacum.io").pathname.replace(/\/+$/, "");
    } catch {
      return null;
    }
    return /^\/app\/[^/]+$/.test(path) ? path : null;
  }

  function isCurrentSection(section, pathname) {
    return Boolean(section) && (pathname === section || pathname.startsWith(`${section}/`));
  }

  function markActive() {
    const pathname = globalThis.location?.pathname || "";
    for (const button of document.querySelectorAll(`${SIDEBAR} ${NAV_BUTTON}`)) {
      const name = (button.getAttribute("data-testid") || "").slice(NAV_PREFIX.length);
      const link = NOT_SECTIONS.includes(name) ? null : button.closest?.(SECTION_LINK);
      const active = isCurrentSection(sectionPath(link?.getAttribute("href")), pathname);
      if (active && !button.hasAttribute(ACTIVE_ATTR)) button.setAttribute(ACTIVE_ATTR, "");
      if (!active && button.hasAttribute(ACTIVE_ATTR)) button.removeAttribute(ACTIVE_ATTR);
    }
  }

  function clearActive() {
    for (const button of document.querySelectorAll(`[${ACTIVE_ATTR}]`)) button.removeAttribute(ACTIVE_ATTR);
  }

  // ---------------------------------------------------------------------------
  // Style + lifecycle
  // ---------------------------------------------------------------------------

  function getStyleEl() {
    return document.getElementById(STYLE_ID);
  }

  function ensureStyleEl() {
    if (getStyleEl()) return;
    const el = document.createElement("style");
    el.id = STYLE_ID;
    el.textContent = buildCss();
    (document.head || document.documentElement).appendChild(el);
  }

  let observer = null;

  function refresh() {
    if (!getStyleEl()) ensureStyleEl();
    markActive();
  }

  function startObserver() {
    if (observer) return;
    observer = new MutationObserver(refresh);
    // <head> only: our <style> may be dropped by React, and <title> text changes on navigation.
    observer.observe(document.head || document.documentElement, { childList: true, subtree: true, characterData: true });
    globalThis.addEventListener?.("popstate", refresh);
  }

  function stopObserver() {
    observer?.disconnect();
    observer = null;
    globalThis.removeEventListener?.("popstate", refresh);
  }

  function enable() {
    ensureStyleEl();
    document.documentElement.setAttribute(ROOT_ATTR, "true");
    markActive();
    startObserver();
  }

  function disable() {
    stopObserver();
    getStyleEl()?.remove();
    document.documentElement.removeAttribute(ROOT_ATTR);
    clearActive();
  }

  async function applySetting() {
    const data = await chrome.storage.local.get(CONFIG_KEY);
    if (data?.[CONFIG_KEY]?.lightThemeNavEnabled) enable();
    else disable();
  }

  function init() {
    applySetting();
    chrome.storage.onChanged.addListener((changes) => {
      if (changes[CONFIG_KEY]) applySetting();
    });
  }

  globalThis.AbKeyLightNav = Object.freeze({ buildCss, sectionPath, isCurrentSection, markActive });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
