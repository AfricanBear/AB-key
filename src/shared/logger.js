export const LogLevel = Object.freeze({
  ERROR: "error",
  WARN: "warn",
  INFO: "info",
  DEBUG: "debug"
});

const LOG_KEY = "mv3ClickAutomation.logs";

export function createCorrelationId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

export async function appendLog(entry) {
  const { [LOG_KEY]: current = [] } = await chrome.storage.local.get(LOG_KEY);
  current.push({ ts: Date.now(), ...entry });
  const trimmed = current.slice(-500);
  await chrome.storage.local.set({ [LOG_KEY]: trimmed });
}

export async function log(level, message, context = {}) {
  const payload = { level, message, context };
  if (level === LogLevel.ERROR) {
    console.error("[MV3-AUTO]", payload);
  } else if (level === LogLevel.WARN) {
    console.warn("[MV3-AUTO]", payload);
  } else {
    console.log("[MV3-AUTO]", payload);
  }
  await appendLog(payload);
}
