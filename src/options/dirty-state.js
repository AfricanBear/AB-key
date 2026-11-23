// Unsaved-changes tracking for the options page (pure, no DOM).
// A form state is { toggles: { [checkboxId]: boolean }, json: string }.
// Toggles mirror flags inside the JSON, so a toggle change also edits the JSON; the JSON field
// counts as changed only when something other than those flags differs.

function withoutKeys(text, keys) {
  const parsed = JSON.parse(text);
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    for (const key of keys) delete parsed[key];
  }
  return JSON.stringify(parsed);
}

function sameJson(a, b, ignoredKeys) {
  if (a === b) return true;
  try {
    return withoutKeys(a, ignoredKeys) === withoutKeys(b, ignoredKeys);
  } catch {
    return false; // half-typed JSON is a change
  }
}

/** What differs from the last loaded or saved state. */
export function diffForm(baseline, current) {
  if (!baseline) return { toggles: [], json: false, count: 0 };
  const ids = Object.keys(current.toggles);
  const toggles = ids.filter((id) => Boolean(current.toggles[id]) !== Boolean(baseline.toggles[id]));
  const json = !sameJson(baseline.json, current.json, ids);
  return { toggles, json, count: toggles.length + (json ? 1 : 0) };
}
