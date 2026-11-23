// "Pop out": the hotkey panel in its own small window (type "popup": no address bar or toolbar).
// One window at most; a second Pop out focuses the open one.

export const DETACH_MESSAGE = "AB_KEY_DETACH_PANEL";
export const PANEL_PATH = "src/popup/popup.html";
// Last position and width of the window (not part of the hotkey config).
export const BOUNDS_KEY = "abKey.detachedPanel.bounds";
export const DEFAULT_WIDTH = 360;
export const DEFAULT_HEIGHT = 560;
// Query keys of the in-page panel URL that carry the page context (see ab-key-panel-host.js).
const CONTEXT_PARAMS = ["host", "path", "rail", "nav"];

export function isDetachedPanelUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.pathname.endsWith(`/${PANEL_PATH}`) && parsed.searchParams.get("detached") === "1";
  } catch {
    return false;
  }
}

/** Window id of the open detached panel, or null. */
export async function findDetachedWindowId(api = chrome) {
  const contexts = await api.runtime.getContexts({ contextTypes: ["TAB"] });
  const match = contexts.find((context) => isDetachedPanelUrl(context.documentUrl));
  return match && Number.isInteger(match.windowId) ? match.windowId : null;
}

/** URL of the detached panel: the in-page panel's context plus the tab it follows. */
export function detachedPanelUrl(api, { sourceTabId, search } = {}) {
  const source = new URLSearchParams(search || "");
  const params = new URLSearchParams({ detached: "1" });
  if (Number.isInteger(sourceTabId)) params.set("tab", String(sourceTabId));
  for (const key of CONTEXT_PARAMS) {
    if (source.has(key)) params.set(key, source.get(key));
  }
  return api.runtime.getURL(`${PANEL_PATH}?${params.toString()}`);
}

export async function openDetachedPanel({ sourceTabId, search } = {}, api = chrome) {
  const existing = await findDetachedWindowId(api);
  if (existing !== null) {
    await api.windows.update(existing, { focused: true });
    return { windowId: existing, created: false };
  }
  const saved = (await api.storage.local.get(BOUNDS_KEY))[BOUNDS_KEY] || {};
  const options = {
    url: detachedPanelUrl(api, { sourceTabId, search }),
    type: "popup",
    focused: true,
    width: Number.isInteger(saved.width) && saved.width >= 280 ? saved.width : DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT
  };
  if (Number.isInteger(saved.left) && Number.isInteger(saved.top)) {
    options.left = saved.left;
    options.top = saved.top;
  }
  let window;
  try {
    window = await api.windows.create(options);
  } catch {
    // A saved position can be off-screen after a monitor change; fall back to the default place.
    delete options.left;
    delete options.top;
    window = await api.windows.create(options);
  }
  return { windowId: window?.id ?? null, created: true };
}
