import { CONFIG_KEY, isNavActionId, isRailActionId, migrateConfig } from "../shared/config-schema.js";

const hotkeyList = document.getElementById("hotkeyList");
const emptyState = document.getElementById("emptyState");
const optionsButton = document.getElementById("optionsButton");
const panelParams = new URLSearchParams(location.search);
const panelHostname = panelParams.get("host") || "app.abacum.io";
// Page path the panel was opened on; null if unknown (then path-scoped hotkeys are shown).
const panelPathname = panelParams.get("path");
// Labels of the right toolbar rail on the current page (top to bottom), or null if unknown.
const railLabels = parseRailLabels(panelParams.get("rail"));
// Labels of the left navigation links after Library (Alt+Shift+1–9), or null if unknown.
const navLabels = parseRailLabels(panelParams.get("nav"));

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
  window.parent.postMessage({ type: "AB_KEY_PANEL_RESIZE", height }, "*");
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

  const raw = await chrome.storage.local.get(CONFIG_KEY);
  const config = migrateConfig(raw[CONFIG_KEY]);
  renderBindings(config.hotkeys || [], config.actions || [], panelHostname, panelPathname);
}

init().catch(() => {
  emptyState.hidden = false;
  emptyState.textContent = "Could not load hotkeys.";
  syncPanelHeight();
});
