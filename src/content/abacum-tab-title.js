(function () {
  "use strict";

  const CONFIG_KEY = "mv3ClickAutomation.config";
  const TITLE_PREFIX_RE = /^.*?\s\|\s/;

  let observer = null;
  let intervalId = null;

  function getClientName() {
    const img = document.querySelector('img[alt]:not([alt=""])');
    if (!img) return null;

    const alt = img.getAttribute("alt")?.trim();
    if (!alt || alt.length < 2) return null;

    return alt;
  }

  function stripTitlePrefix() {
    document.title = document.title.replace(TITLE_PREFIX_RE, "");
  }

  function updateTitle() {
    const clientName = getClientName();
    if (!clientName) return;

    if (document.title.startsWith(`${clientName} | `)) return;

    const cleanTitle = document.title.replace(TITLE_PREFIX_RE, "");
    document.title = `${clientName} | ${cleanTitle}`;
  }

  function stop() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    stripTitlePrefix();
  }

  function start() {
    if (observer || intervalId) return;

    updateTitle();

    observer = new MutationObserver(() => {
      updateTitle();
    });

    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true });
    }

    // React may overwrite document.title after navigation or state updates.
    intervalId = setInterval(updateTitle, 1000);
  }

  async function isEnabled() {
    const data = await chrome.storage.local.get(CONFIG_KEY);
    const config = data?.[CONFIG_KEY];
    if (!config || typeof config.abacumTabTitleEnabled !== "boolean") return true;
    return config.abacumTabTitleEnabled;
  }

  async function applySetting() {
    const enabled = await isEnabled();
    if (enabled) {
      start();
    } else {
      stop();
    }
  }

  function onConfigChanged(changes) {
    if (!changes[CONFIG_KEY]) return;
    applySetting();
  }

  function init() {
    applySetting();
    chrome.storage.onChanged.addListener(onConfigChanged);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
