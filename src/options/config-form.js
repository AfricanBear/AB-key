// The options page JSON is the single source of truth; feature toggles are a view of its
// boolean flags (checkbox id = config key). Pure helpers, no DOM.
import { migrateConfig } from "../shared/config-schema.js";

/** Parses the JSON text; null if it is not a JSON object (e.g. still being typed). */
export function parseConfigText(text) {
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** { [flagId]: boolean } as Save would store them (missing flags get defaults); null if not usable. */
export function flagsFromText(text, flagIds) {
  const parsed = parseConfigText(text);
  if (!parsed) return null;
  let config;
  try {
    config = migrateConfig(parsed);
  } catch {
    return null; // valid JSON but not a valid config (e.g. no "actions")
  }
  return Object.fromEntries(flagIds.map((id) => [id, config[id] === true]));
}

/** JSON text with one flag set; null if the text is not a JSON object. */
export function setFlagInText(text, flagId, value) {
  const parsed = parseConfigText(text);
  if (!parsed) return null;
  parsed[flagId] = Boolean(value);
  return JSON.stringify(parsed, null, 2);
}
