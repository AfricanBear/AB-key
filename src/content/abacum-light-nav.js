(function () {
  "use strict";

  const CONFIG_KEY = "mv3ClickAutomation.config";
  const STYLE_ID = "ab-key-light-nav-styles";
  const ROOT_ATTR = "data-ab-key-light-nav";

  const DRAWER_PAPER_RULES = `
    background-color: transparent !important;
    background-image: linear-gradient(to right, rgb(255 255 255) 0px, rgb(254 254 254) 48px, transparent 48px, transparent 100%) !important;
    border-right-width: medium !important;
    border-right-style: none !important;
    border-right-color: currentcolor !important;
    display: flex !important;
    -webkit-box-pack: justify !important;
    justify-content: space-between !important;
    min-width: 48px !important;
    overflow: visible !important;
  `;

  const WHITE_ACCENT_RULES = `
    color: #f4f0ff !important;
    background-color: #ffffff !important;
    border-color: rgba(186, 168, 230, 0.35) !important;
  `;

  const LAVENDER_ACCENT_RULES = `
    color: #f4f0ff !important;
    background-color: #b8a8d8 !important;
    border-color: rgba(186, 168, 230, 0.45) !important;
  `;

  const ICON_RULES = `
    color: #302048 !important;
    fill: #302048 !important;
  `;

  function buildCss() {
    const drawerSelectors = [
      ".css-14gnnq .MuiDrawer-paper",
      ".css-x08bwa.MuiDrawer-paper",
      ".css-h6rx5j .MuiDrawer-paper",
      ".MuiDrawer-root .MuiDrawer-paper"
    ].join(",\n");

    const whiteAccentSelectors = [
      ".css-s8husd",
      ".css-s9zrci",
      ".MuiDrawer-root .css-s8husd",
      ".MuiDrawer-root .css-s9zrci"
    ].join(",\n");

    const lavenderAccentSelectors = [
      ".css-s7gj1v",
      ".MuiDrawer-root .css-s7gj1v"
    ].join(",\n");

    return `
/* AB-key light theme nav */
${drawerSelectors} {
  ${DRAWER_PAPER_RULES}
}

${whiteAccentSelectors} {
  ${WHITE_ACCENT_RULES}
}

${lavenderAccentSelectors} {
  ${LAVENDER_ACCENT_RULES}
}

${whiteAccentSelectors} svg,
${lavenderAccentSelectors} svg {
  ${ICON_RULES}
}
`;
  }

  function getStyleEl() {
    return document.getElementById(STYLE_ID);
  }

  function ensureStyleEl() {
    let el = getStyleEl();
    if (el) return el;
    el = document.createElement("style");
    el.id = STYLE_ID;
    el.type = "text/css";
    el.textContent = buildCss();
    (document.head || document.documentElement).appendChild(el);
    return el;
  }

  function removeStyleEl() {
    getStyleEl()?.remove();
    document.documentElement.removeAttribute(ROOT_ATTR);
  }

  async function isEnabled() {
    const data = await chrome.storage.local.get(CONFIG_KEY);
    const config = data?.[CONFIG_KEY];
    return Boolean(config?.lightThemeNavEnabled);
  }

  function enable() {
    ensureStyleEl();
    document.documentElement.setAttribute(ROOT_ATTR, "true");
  }

  function disable() {
    removeStyleEl();
  }

  async function applySetting() {
    const enabled = await isEnabled();
    if (enabled) {
      enable();
    } else {
      disable();
    }
  }

  function onConfigChanged(changes) {
    if (!changes[CONFIG_KEY]) return;
    applySetting();
  }

  function startObserver() {
    const observer = new MutationObserver(() => {
      if (!document.documentElement.hasAttribute(ROOT_ATTR)) return;
      ensureStyleEl();
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class"]
    });
  }

  function init() {
    applySetting();
    startObserver();
    chrome.storage.onChanged.addListener(onConfigChanged);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
