import { getConfig, resetConfig } from "./config-store.js";
import { LogLevel, log } from "../shared/logger.js";
import { DETACH_MESSAGE, openDetachedPanel } from "./detached-window.js";
import { GUIDE_KEY, guideStateOnInstalled } from "../shared/guide-state.js";

// Versions before 1.6.1 kept a log of up to 500 entries in storage that nothing read.
const LEGACY_LOG_KEY = "mv3ClickAutomation.logs";

async function initGuideState(reason, previousVersion) {
  const stored = await chrome.storage.local.get(GUIDE_KEY);
  const next = guideStateOnInstalled(stored[GUIDE_KEY], {
    reason,
    previousVersion,
    version: chrome.runtime.getManifest().version
  });
  await chrome.storage.local.set({ [GUIDE_KEY]: next });
}

chrome.runtime.onInstalled.addListener(async ({ reason, previousVersion }) => {
  await initGuideState(reason, previousVersion).catch(() => {});
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

// Pop out from the in-page panel (an iframe inside the Abacum tab, so sender.tab is that tab).
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== DETACH_MESSAGE) return false;
  openDetachedPanel({ sourceTabId: sender.tab?.id, search: message.search })
    .then((result) => sendResponse({ ok: true, ...result }))
    .catch((error) => {
      log(LogLevel.WARN, "Could not open the detached A+B key window", { message: error?.message });
      sendResponse({ ok: false });
    });
  return true;
});

chrome.action.onClicked.addListener((tab) => {
  togglePanelOnTab(tab).catch(() => {
    // Errors are logged inside togglePanelOnTab.
  });
});
