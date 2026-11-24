// State of the AB-key guide (tips at Abacum buttons), kept apart from the config so that
// Export / Import of the config does not carry it:
//   { seen: [step ids already shown], baseline: "x.y.z" }
// baseline = the extension version the user started with: "Only new features" shows only
// steps whose `since` is newer than it.
export const GUIDE_KEY = "abKey.guide"; // keep in sync with src/content/ab-key-guide.js

/**
 * Pure: the guide state after chrome.runtime.onInstalled.
 * A fresh install starts at the current version; an update from a version without the guide
 * starts at the previous version, so the features of the update count as new. An existing
 * baseline is kept.
 */
export function guideStateOnInstalled(state, { reason, previousVersion, version }) {
  const seen = Array.isArray(state?.seen) ? [...state.seen] : [];
  if (typeof state?.baseline === "string" && state.baseline) return { seen, baseline: state.baseline };
  const baseline = reason === "update" && previousVersion ? previousVersion : version;
  return { seen, baseline };
}
