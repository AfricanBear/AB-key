(function () {
  if (window.__abKeyPanelHostReady) return;
  window.__abKeyPanelHostReady = true;

  const ROOT_ID = "ab-key-panel-root";
  const BACKDROP_ID = "ab-key-panel-backdrop";
  const IFRAME_CLASS = "ab-key-panel-iframe";
  const PANEL_URL = chrome.runtime.getURL("src/popup/popup.html");

  let escapeHandler = null;
  let backdropHandler = null;

  function isOpen() {
    return Boolean(document.getElementById(ROOT_ID));
  }

  function detachCloseHandlers() {
    if (escapeHandler) {
      document.removeEventListener("keydown", escapeHandler, true);
      escapeHandler = null;
    }
    if (backdropHandler) {
      document.getElementById(BACKDROP_ID)?.removeEventListener("click", backdropHandler);
      backdropHandler = null;
    }
  }

  function resizePanel(height) {
    const root = document.getElementById(ROOT_ID);
    const iframe = root?.querySelector(`.${IFRAME_CLASS}`);
    if (!iframe || !Number.isFinite(height) || height <= 0) return;
    iframe.style.height = `${Math.ceil(height)}px`;
    root.style.visibility = "visible";
  }

  function closePanel() {
    detachCloseHandlers();
    document.getElementById(ROOT_ID)?.remove();
    document.getElementById(BACKDROP_ID)?.remove();
  }

  function openPanel() {
    if (isOpen()) return;

    const backdrop = document.createElement("div");
    backdrop.id = BACKDROP_ID;
    backdrop.setAttribute("data-ab-key-panel", "backdrop");

    const root = document.createElement("div");
    root.id = ROOT_ID;
    root.setAttribute("data-ab-key-panel", "root");
    root.style.visibility = "hidden";

    const iframe = document.createElement("iframe");
    iframe.className = IFRAME_CLASS;
    const params = new URLSearchParams({ host: location.hostname, path: location.pathname });
    // Pass the live rail labels so the panel shows what Alt+1–5 do on this page.
    const rail = globalThis.AbKeyToolbarRail?.describe();
    if (rail) params.set("rail", JSON.stringify(rail.buttons.map((button) => button.label || "")));
    // Same for the left navigation links behind Alt+Shift+1–9.
    const nav = globalThis.AbKeySidebarNav?.describe();
    if (nav) params.set("nav", JSON.stringify(nav.map((item) => item.label || "")));
    iframe.src = `${PANEL_URL}?${params.toString()}`;
    iframe.setAttribute("title", "A+B key");

    root.appendChild(iframe);
    document.documentElement.appendChild(backdrop);
    document.documentElement.appendChild(root);

    backdropHandler = () => closePanel();
    backdrop.addEventListener("click", backdropHandler);

    escapeHandler = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closePanel();
      }
    };
    document.addEventListener("keydown", escapeHandler, true);
  }

  function togglePanel() {
    if (isOpen()) {
      closePanel();
      return false;
    }
    openPanel();
    return true;
  }

  window.addEventListener("message", (event) => {
    if (event.data?.type !== "AB_KEY_PANEL_RESIZE") return;
    const iframe = document.querySelector(`#${ROOT_ID} .${IFRAME_CLASS}`);
    if (!iframe || event.source !== iframe.contentWindow) return;
    resizePanel(event.data.height);
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "TOGGLE_AB_KEY_PANEL") return false;
    const open = togglePanel();
    sendResponse({ ok: true, open });
    return false;
  });
})();
