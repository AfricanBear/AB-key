// Unsaved-changes tracking for the options page (pure, no DOM).
// A form state is { toggles: { [checkboxId]: boolean }, json: string }.

function sameJson(a, b) {
  if (a === b) return true;
  try {
    return JSON.stringify(JSON.parse(a)) === JSON.stringify(JSON.parse(b));
  } catch {
    return false; // half-typed JSON is a change
  }
}

/** What differs from the last loaded or saved state. */
export function diffForm(baseline, current) {
  if (!baseline) return { toggles: [], json: false, count: 0 };
  const toggles = Object.keys(current.toggles).filter(
    (id) => Boolean(current.toggles[id]) !== Boolean(baseline.toggles[id])
  );
  const json = !sameJson(baseline.json, current.json);
  return { toggles, json, count: toggles.length + (json ? 1 : 0) };
}
