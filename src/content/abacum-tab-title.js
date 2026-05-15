(function () {
  "use strict";

  const TITLE_PREFIX_RE = /^.*?\s\|\s/;

  function getClientName() {
    const img = document.querySelector('img[alt]:not([alt=""])');
    if (!img) return null;

    const alt = img.getAttribute("alt")?.trim();
    if (!alt || alt.length < 2) return null;

    return alt;
  }

  function updateTitle() {
    const clientName = getClientName();
    if (!clientName) return;

    if (document.title.startsWith(`${clientName} | `)) return;

    const cleanTitle = document.title.replace(TITLE_PREFIX_RE, "");
    document.title = `${clientName} | ${cleanTitle}`;
  }

  function start() {
    updateTitle();

    const observer = new MutationObserver(() => {
      updateTitle();
    });

    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true });
    }

    // React may overwrite document.title after navigation or state updates.
    setInterval(updateTitle, 1000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
