import { CONFIG_KEY, isNavActionId, isRailActionId, migrateConfig } from "../shared/config-schema.js";

const hotkeyList = document.getElementById("hotkeyList");
const emptyState = document.getElementById("emptyState");
const optionsButton = document.getElementById("optionsButton");
const detachButton = document.getElementById("detachButton");
const guideButton = document.getElementById("guideButton");
// Tips of the AB-key guide (src/content/ab-key-guide.js) for the page the panel belongs to.
const GUIDE_REPLAY_MESSAGE = "AB_KEY_GUIDE_REPLAY";

// Extension version from manifest.json, next to the title.
const appVersion = document.getElementById("appVersion");
if (appVersion) appVersion.textContent = `v${chrome.runtime.getManifest().version}`;
const panelParams = new URLSearchParams(location.search);
// Popped out into its own window (src/background/detached-window.js) instead of the in-page iframe.
const detached = panelParams.get("detached") === "1";
if (detached) document.documentElement.classList.add("is-detached");
let panelHostname = panelParams.get("host") || "app.abacum.io";
// Page path the panel was opened on; null if unknown (then path-scoped hotkeys are shown).
let panelPathname = panelParams.get("path");
// Labels of the right toolbar rail on the current page (top to bottom), or null if unknown.
let railLabels = parseRailLabels(panelParams.get("rail"));
// Labels of the left navigation links after Library (Alt+Shift+1–9), or null if unknown.
let navLabels = parseRailLabels(panelParams.get("nav"));
// Last loaded config, re-rendered when the page context or the config changes.
let currentConfig = null;

function parseRailLabels(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((label) => String(label || "")) : null;
  } catch {
    return null;
  }
}

const POPUP_LABEL_OVERRIDES = {
  "action.bulkDimensions": "Edit Dimensions",
  "action.addCreate": "Context: Add + Create variable"
};

function railRowLabel(action) {
  const position = action.locatorProfile?.toolbarRail?.position;
  if (!railLabels) return `Rail button ${position}`;
  const label = railLabels[position - 1];
  if (label === undefined) return null; // no such button on this page
  return label || `Rail button ${position}`;
}

function navRowLabel(action) {
  const position = action.locatorProfile?.sidebarNav?.position;
  if (!navLabels) return `Navigation link ${position}`;
  const label = navLabels[position - 1];
  if (label === undefined) return null; // fewer links on this page
  return `Go to ${label || `link ${position}`}`;
}

function shortLabel(action) {
  if (!action) return "Action";
  if (POPUP_LABEL_OVERRIDES[action.actionId]) {
    return POPUP_LABEL_OVERRIDES[action.actionId];
  }
  if (!action.label) return "Action";
  const trimmed = action.label.replace(/^Open\s+/i, "").trim();
  return trimmed.split(/\s+/).slice(0, 2).join(" ");
}

function formatHotkey(key) {
  return key
    .split("+")
    .map((part) => {
      if (part.length === 1) return part.toUpperCase();
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join("+");
}

function hostMatches(bindingHosts, hostname) {
  const allowed = bindingHosts || ["*"];
  if (allowed.includes("*")) return true;
  return allowed.some((entry) => hostname === entry || hostname.endsWith(`.${entry}`));
}

function pathMatches(bindingPaths, pathname) {
  if (!Array.isArray(bindingPaths) || !bindingPaths.length || pathname === null) return true;
  return bindingPaths.some((prefix) => pathname.startsWith(prefix));
}

function escapeHtml(text) {
  const el = document.createElement("span");
  el.textContent = text;
  return el.innerHTML;
}

function syncPanelHeight() {
  const shell = document.querySelector(".popup-shell");
  if (!shell) return;
  const height = Math.ceil(shell.getBoundingClientRect().height);
  if (detached) {
    fitWindowHeight(height);
    return;
  }
  window.parent.postMessage({ type: "AB_KEY_PANEL_RESIZE", height }, "*");
}

// --- Detached window -----------------------------------------------------------------------

let ownWindowId = null;
let fittedHeight = 0;
let live = null;

/** Grow or shrink the detached window to its content when the list changes. */
function fitWindowHeight(contentHeight) {
  if (ownWindowId === null || !contentHeight || contentHeight === fittedHeight) return;
  fittedHeight = contentHeight;
  const frame = Math.max(0, window.outerHeight - window.innerHeight);
  chrome.windows.update(ownWindowId, { height: contentHeight + frame }).catch(() => {});
}

function contextKey() {
  return JSON.stringify([panelHostname, panelPathname, railLabels, navLabels]);
}

/** The guide runs only on Abacum pages (its content script is not injected elsewhere). */
function syncGuideButton() {
  if (!guideButton) return;
  guideButton.hidden = !/(^|\.)abacum\.io$/.test(panelHostname);
}

async function showGuide() {
  if (!detached) {
    // In-page panel: the host closes the panel and starts the tips in the same tab.
    window.parent.postMessage({ type: GUIDE_REPLAY_MESSAGE }, "*");
    return;
  }
  const tabId = live?.tabId;
  if (!Number.isInteger(tabId)) return;
  try {
    const tab = await chrome.tabs.get(tabId);
    await chrome.windows.update(tab.windowId, { focused: true });
    await chrome.tabs.sendMessage(tabId, { type: GUIDE_REPLAY_MESSAGE });
  } catch {
    // tab closed or without AB-key
  }
}

function applyContext(context) {
  const before = contextKey();
  panelHostname = context.host || panelHostname;
  syncGuideButton();
  panelPathname = typeof context.path === "string" ? context.path : null;
  railLabels = Array.isArray(context.rail) ? context.rail.map((label) => String(label || "")) : null;
  navLabels = Array.isArray(context.nav) ? context.nav.map((label) => String(label || "")) : null;
  if (contextKey() !== before) render();
}

async function startDetached() {
  const [{ createLiveContext }, { BOUNDS_KEY }] = await Promise.all([
    import("./live-context.js"),
    import("../background/detached-window.js")
  ]);
  ownWindowId = (await chrome.windows.getCurrent()).id;
  // Remember where the window was put and how wide it was.
  chrome.windows.onBoundsChanged?.addListener((win) => {
    if (win.id !== ownWindowId) return;
    chrome.storage.local.set({ [BOUNDS_KEY]: { left: win.left, top: win.top, width: win.width } });
  });
  live = createLiveContext({ ownWindowId, onContext: applyContext });
  const sourceTab = Number.parseInt(panelParams.get("tab"), 10);
  await live.start(Number.isInteger(sourceTab) ? sourceTab : undefined);
  // Rail labels also change without navigation (an object or a side panel opens).
  setInterval(() => {
    if (document.visibilityState === "visible") live.refresh();
  }, 2000);
  window.addEventListener("focus", () => live.refresh());
  syncPanelHeight();
}

async function popOut() {
  try {
    const response = await chrome.runtime.sendMessage({ type: "AB_KEY_DETACH_PANEL", search: location.search });
    if (response?.ok) window.parent.postMessage({ type: "AB_KEY_PANEL_CLOSE" }, "*");
  } catch {
    // service worker unavailable; the in-page panel stays open
  }
}

function render() {
  if (!currentConfig) return;
  renderBindings(currentConfig.hotkeys || [], currentConfig.actions || [], panelHostname, panelPathname);
}

function renderBindings(hotkeys, actions, hostname, pathname) {
  hotkeyList.replaceChildren();
  const actionById = new Map(actions.map((a) => [a.actionId, a]));
  const rows = hotkeys
    .filter((binding) => hostMatches(binding.hosts, hostname) && pathMatches(binding.paths, pathname))
    .map((binding) => {
      const action = actionById.get(binding.actionId);
      if (!action || !action.enabled) return null;
      const label = isRailActionId(action.actionId)
        ? railRowLabel(action)
        : isNavActionId(action.actionId)
          ? navRowLabel(action)
          : shortLabel(action);
      if (!label) return null;
      return {
        label,
        hotkey: formatHotkey(binding.key)
      };
    })
    .filter(Boolean);

  if (!rows.length) {
    emptyState.hidden = false;
  } else {
    emptyState.hidden = true;
    for (const row of rows) {
      const li = document.createElement("li");
      li.className = "hotkey-row";
      li.innerHTML = `<span class="hotkey-label">${escapeHtml(row.label)}</span><kbd class="hotkey-kbd">${escapeHtml(row.hotkey)}</kbd>`;
      hotkeyList.appendChild(li);
    }
  }

  syncPanelHeight();
}

async function init() {
  optionsButton.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });
  detachButton?.addEventListener("click", popOut);
  guideButton?.addEventListener("click", showGuide);
  syncGuideButton();

  const raw = await chrome.storage.local.get(CONFIG_KEY);
  currentConfig = migrateConfig(raw[CONFIG_KEY]);
  render();

  // Hotkeys edited in Options show up without reopening the panel.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[CONFIG_KEY]) return;
    currentConfig = migrateConfig(changes[CONFIG_KEY].newValue);
    render();
  });

  if (detached) await startDetached();
}

init().catch(() => {
  emptyState.hidden = false;
  emptyState.textContent = "Could not load hotkeys.";
  syncPanelHeight();
});
