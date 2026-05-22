import { CONFIG_KEY, migrateConfig } from "../shared/config-schema.js";

const hotkeyList = document.getElementById("hotkeyList");
const emptyState = document.getElementById("emptyState");
const optionsLink = document.getElementById("optionsLink");

const POPUP_LABEL_OVERRIDES = {
  "action.bulkDimensions": "Edit Dimensions",
  "action.addCreate": "Context: Add + Create variable"
};

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
  return allowed.some((entry) => hostname.endsWith(entry));
}

function escapeHtml(text) {
  const el = document.createElement("span");
  el.textContent = text;
  return el.innerHTML;
}

function renderBindings(hotkeys, actions, hostname) {
  hotkeyList.replaceChildren();
  const actionById = new Map(actions.map((a) => [a.actionId, a]));
  const rows = hotkeys
    .filter((binding) => hostMatches(binding.hosts, hostname))
    .map((binding) => {
      const action = actionById.get(binding.actionId);
      if (action && !action.enabled) return null;
      return {
        label: shortLabel(action),
        hotkey: formatHotkey(binding.key)
      };
    })
    .filter(Boolean);

  if (!rows.length) {
    emptyState.hidden = false;
    return;
  }

  emptyState.hidden = true;
  for (const row of rows) {
    const li = document.createElement("li");
    li.className = "hotkey-row";
    li.innerHTML = `<span class="hotkey-label">${escapeHtml(row.label)}</span><kbd class="hotkey-kbd">${escapeHtml(row.hotkey)}</kbd>`;
    hotkeyList.appendChild(li);
  }
}

async function init() {
  optionsLink.addEventListener("click", (event) => {
    event.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  const raw = await chrome.storage.local.get(CONFIG_KEY);
  const config = migrateConfig(raw[CONFIG_KEY]);
  renderBindings(config.hotkeys || [], config.actions || [], "app.abacum.io");
}

init().catch(() => {
  emptyState.hidden = false;
  emptyState.textContent = "Could not load hotkeys.";
});
