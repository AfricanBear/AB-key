import { getConfig, resetConfig } from "./config-store.js";
import { canRunOnHost, resolveActionForCommand } from "./hotkey-orchestrator.js";
import { ErrorCode, ExtensionError } from "../shared/errors.js";
import { LogLevel, createCorrelationId, log } from "../shared/logger.js";

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tabs[0];
}

function buildExecuteMessage(action, correlationId) {
  return {
    type: "EXECUTE_ACTION",
    correlationId,
    payload: {
      actionId: action.actionId,
      locatorProfile: action.locatorProfile,
      executionPolicy: action.executionPolicy
    }
  };
}

async function executeCommand(command) {
  const correlationId = createCorrelationId();
  const config = await getConfig();
  const tab = await getActiveTab();
  if (!tab || !tab.id || !tab.url) {
    throw new ExtensionError(ErrorCode.RuntimeFailure, "No active tab available.");
  }
  const host = new URL(tab.url).hostname;
  const action = resolveActionForCommand(config, command);
  if (!canRunOnHost(action, host)) {
    throw new ExtensionError(ErrorCode.PermissionDenied, `Action ${action.actionId} is not allowed on ${host}.`);
  }
  await log(LogLevel.INFO, "Dispatching action to content script", { correlationId, command, actionId: action.actionId, tabId: tab.id });
  const response = await chrome.tabs.sendMessage(tab.id, buildExecuteMessage(action, correlationId));
  if (!response || !response.ok) {
    throw new ExtensionError(response?.error?.code || ErrorCode.RuntimeFailure, response?.error?.message || "Action failed.", response?.error?.details);
  }
  await log(LogLevel.INFO, "Action execution succeeded", { correlationId, actionId: action.actionId, elapsedMs: response.elapsedMs });
}

chrome.runtime.onInstalled.addListener(async () => {
  await resetConfig();
  await log(LogLevel.INFO, "Extension installed and configuration initialized.");
});

chrome.commands.onCommand.addListener(async (command) => {
  try {
    await executeCommand(command);
  } catch (error) {
    await log(LogLevel.ERROR, "Command execution failed", {
      command,
      code: error.code || ErrorCode.RuntimeFailure,
      message: error.message,
      details: error.details
    });
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "GET_CONFIG") {
    getConfig()
      .then((config) => sendResponse({ ok: true, config }))
      .catch((error) => sendResponse({ ok: false, error: { code: error.code, message: error.message } }));
    return true;
  }
  sendResponse({ ok: false, error: { code: ErrorCode.RuntimeFailure, message: "Unknown message type." } });
  return false;
});
