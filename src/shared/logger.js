export const LogLevel = Object.freeze({
  ERROR: "error",
  WARN: "warn",
  INFO: "info"
});

/** Service worker logs: console only (chrome://extensions → service worker → Console). */
export function log(level, message, context = {}) {
  const payload = { level, message, context };
  if (level === LogLevel.ERROR) console.error("[AB-key]", payload);
  else if (level === LogLevel.WARN) console.warn("[AB-key]", payload);
  else console.log("[AB-key]", payload);
}
