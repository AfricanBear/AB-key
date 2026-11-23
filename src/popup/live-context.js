// The detached panel follows the active tab of the last focused normal window and asks its
// content script (ab-key-panel-host.js) for the page context. Tabs without AB-key (not Abacum)
// do not answer, and the last known context stays on screen.

export const CONTEXT_MESSAGE = "AB_KEY_PANEL_CONTEXT";
// Abacum renders the rail and navigation a moment after navigation, so ask again a bit later.
export const RETRY_DELAYS_MS = [0, 400, 1500];

export function createLiveContext({
  api = chrome,
  ownWindowId = null,
  onContext,
  retryDelays = RETRY_DELAYS_MS,
  setTimer = setTimeout,
  clearTimer = clearTimeout
}) {
  let tabId = null;
  let timers = [];

  async function fetchContext(id) {
    let response;
    try {
      response = await api.tabs.sendMessage(id, { type: CONTEXT_MESSAGE });
    } catch {
      return; // no AB-key content script in that tab
    }
    if (id !== tabId || !response?.ok || !response.context) return;
    onContext(response.context);
  }

  function track(id, delays = retryDelays) {
    if (!Number.isInteger(id)) return;
    tabId = id;
    for (const timer of timers) clearTimer(timer);
    timers = delays.map((delay) => setTimer(() => fetchContext(id), delay));
  }

  async function trackActiveTabOf(windowId) {
    if (!Number.isInteger(windowId) || windowId === api.windows.WINDOW_ID_NONE || windowId === ownWindowId) return;
    let tabs;
    try {
      tabs = await api.tabs.query({ active: true, windowId });
    } catch {
      return;
    }
    if (tabs?.[0]) track(tabs[0].id);
  }

  const onActivated = ({ tabId: id, windowId }) => {
    if (windowId !== ownWindowId) track(id);
  };
  const onUpdated = (id, change) => {
    if (id === tabId && (change?.url || change?.status === "complete")) track(id);
  };
  const onFocusChanged = (windowId) => {
    trackActiveTabOf(windowId);
  };

  return {
    get tabId() {
      return tabId;
    },
    async start(initialTabId) {
      api.tabs.onActivated.addListener(onActivated);
      api.tabs.onUpdated.addListener(onUpdated);
      api.windows.onFocusChanged.addListener(onFocusChanged);
      if (Number.isInteger(initialTabId)) {
        track(initialTabId);
        return;
      }
      try {
        const window = await api.windows.getLastFocused({ windowTypes: ["normal"] });
        await trackActiveTabOf(window?.id);
      } catch {
        // no normal window yet
      }
    },
    /** Ask the tracked tab once more (rail labels change when a panel or object opens). */
    refresh() {
      if (tabId !== null) track(tabId, [0]);
    },
    stop() {
      for (const timer of timers) clearTimer(timer);
      timers = [];
      api.tabs.onActivated.removeListener(onActivated);
      api.tabs.onUpdated.removeListener(onUpdated);
      api.windows.onFocusChanged.removeListener(onFocusChanged);
    }
  };
}
