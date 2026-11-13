// Abacum: client name at the start of the tab title ("Client | Page - Abacum").
//
// Watches only <head> (the <title> element and its text), not the whole page, and runs no
// permanent timer. A short retry loop covers the moment before the client logo (img[alt]) has
// rendered; it stops as soon as the prefix is set.
// Toggle: config.abacumTabTitleEnabled (Options page).
(function () {
  "use strict";

  const CONFIG_KEY = "mv3ClickAutomation.config";
  const TITLE_PREFIX_RE = /^.*?\s\|\s/;
  const RETRY_MS = 1000;
  const MAX_RETRIES = 30;

  let observer = null;
  let retryTimer = null;

  function getClientName() {
    const img = document.querySelector('img[alt]:not([alt=""])');
    const alt = img?.getAttribute("alt")?.trim();
    return alt && alt.length >= 2 ? alt : null;
  }

  function stripTitlePrefix() {
    document.title = document.title.replace(TITLE_PREFIX_RE, "");
  }

  /** Returns true when the title carries the client name. */
  function updateTitle() {
    const clientName = getClientName();
    if (!clientName) return false;
    if (document.title.startsWith(`${clientName} | `)) return true;
    const cleanTitle = document.title.replace(TITLE_PREFIX_RE, "");
    document.title = `${clientName} | ${cleanTitle}`;
    return true;
  }

  function stopRetry() {
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
  }

  function retryUntilNamed(attempt = 0) {
    stopRetry();
    if (updateTitle() || attempt >= MAX_RETRIES) return;
    retryTimer = setTimeout(() => retryUntilNamed(attempt + 1), RETRY_MS);
  }

  function stop() {
    observer?.disconnect();
    observer = null;
    stopRetry();
    stripTitlePrefix();
  }

  function start() {
    if (observer) return;
    // React rewrites document.title on navigation; re-apply the prefix when it does.
    // Our own write triggers the observer once more, but then the title already starts with
    // the prefix and updateTitle() changes nothing.
    observer = new MutationObserver(() => {
      if (!updateTitle()) retryUntilNamed();
    });
    observer.observe(document.head || document.documentElement, { childList: true, subtree: true, characterData: true });
    retryUntilNamed();
  }

  async function isEnabled() {
    const data = await chrome.storage.local.get(CONFIG_KEY);
    const config = data?.[CONFIG_KEY];
    if (!config || typeof config.abacumTabTitleEnabled !== "boolean") return true;
    return config.abacumTabTitleEnabled;
  }

  async function applySetting() {
    if (await isEnabled()) start();
    else stop();
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
