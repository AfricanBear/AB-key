import { getConfig, resetConfig } from "./config-store.js";
import { LogLevel, log } from "../shared/logger.js";

// Versions before 1.6.1 kept a log of up to 500 entries in storage that nothing read.
const LEGACY_LOG_KEY = "mv3ClickAutomation.logs";

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  // Only a fresh install starts from defaults. Updates and "Reload" of an unpacked
  // extension keep the user's config and just migrate it.
  if (reason === chrome.runtime.OnInstalledReason.INSTALL) {
    await resetConfig();
    log(LogLevel.INFO, "Extension installed and configuration initialized.");
    return;
  }
  await getConfig();
  await chrome.storage.local.remove(LEGACY_LOG_KEY);
  log(LogLevel.INFO, "Extension updated; configuration migrated.", { reason });
});

async function togglePanelOnTab(tab) {
  if (!tab?.id) {
    return;
  }
  const message = { type: "TOGGLE_AB_KEY_PANEL" };
  try {
    await chrome.tabs.sendMessage(tab.id, message);
    return;
  } catch {
    // Content script may not be injected on restricted pages.
  }
  try {
    await chrome.scripting.insertCSS({
      target: { tabId: tab.id },
      files: ["src/content/ab-key-panel-host.css"]
    });
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["src/content/toolbar-rail.js", "src/content/ab-key-panel-host.js"]
    });
    await chrome.tabs.sendMessage(tab.id, message);
  } catch (error) {
    log(LogLevel.WARN, "Could not open A+B key panel on this tab", {
      tabId: tab.id,
      message: error?.message || "Injection failed."
    });
  }
}

chrome.action.onClicked.addListener((tab) => {
  togglePanelOnTab(tab).catch(() => {
    // Errors are logged inside togglePanelOnTab.
  });
});
