# Test and Rollout Plan

## Unit Tests

Automated: `npm test` (see `tests/`). Runs in CI on every push to `main` and every pull request.
When changing the config schema, add a migration test to `tests/config-migration.test.mjs`.

- Config migration:
  - missing config -> defaults.
  - old config version -> migrated config.
  - malformed action entries -> rejected.
- Selector scoring:
  - visibility and clickability impacts rank.
  - text and aria criteria increase confidence.

## Integration Tests

- Command dispatch from service worker reaches active tab content script.
- Content script returns structured success and error payloads.
- Config updates in options page persist and are used by command execution.

## End-to-End Manual Scenarios

- Static page target by CSS selector.
- Dynamic page target rendered after keypress.
- Aria-only icon button.
- Multiple matching elements with index hint.
- Overlay-blocked element yields `OverlayBlocked`.
- Abacum toolbar rail (Alt+1–5, positional):
  - Models: Alt+1 Info, Alt+2 Settings, Alt+3 Dimensions, Alt+4 Activity; Alt+5 does nothing.
  - Dimensions: Alt+1 Info, Alt+2 Activity; Alt+3–5 do nothing.
  - Datasets: Alt+1 Info, Alt+2 Scheduler, Alt+3 Transform, Alt+4 Data usage, Alt+5 Activity.
  - Versions list: Alt+1 Activity.
  - Repeat the checks with a panel already open (rail must still resolve; pressing the same key toggles the panel).
  - AI agent button is never clicked.
  - Hovering a rail button shows the tooltip with its hotkey, e.g. "Info · Alt+1" on Models, "Activity · Alt+5" on Datasets; the AI agent tooltip is unchanged.
  - Russian keyboard layout: Alt+1–5 and Alt+E/S/A still work.
  - Held key does not repeat-trigger actions.
  - A+B key panel lists the rail labels of the current page.
  - Alt+E/S/A behave as before (no regression).
  - Alt+C does nothing (removed in v0.6.3) and is not listed in the A+B key panel.
- Alt+S:
  - Model builder with unsaved changes: clicks the builder Save button.
  - Dialog with a primary Save button open (e.g. dimensions modal): clicks Save in the dialog, not the builder Save behind it.
  - Other pages where Alt+S worked before: still works (fallback search).
- Alt+A (hover a row so "+" is visible): opens the menu and clicks exactly "Create variable", never "Create group" / "Create section".
- Model-only hotkeys (Alt+E, Alt+A):
  - On `/app/modules*`: listed in the A+B key panel and working.
  - On Datasets, Dimensions, Versions: not listed in the panel; pressing them does nothing.
  - Alt+S and Alt+1–5 remain listed and working on all Abacum pages.
- Alt+E (Edit Dimensions, Models builder):
  - With the variable's dimensions button visible: opens the dimensions modal (`module-builder-dbv-modal`).
  - Without that button on the page (or while the modal is open): nothing is clicked — in particular not "Show Builder Formulas".
- Extension reload / update keeps the saved configuration (not reset to defaults).

## Performance Gates

- P50 latency <= 150 ms when target exists immediately.
- P95 latency <= 1000 ms in dynamic mode.
- No observer leak after repeated 100 hotkey executions.

## Rollout

1. Internal alpha (single user profile).
2. Beta with expanded action packs.
3. Production package after two stable beta cycles.

## Operational Readiness

- Log review checklist for failed actions.
- Known limitations:
  - no iframe traversal.
  - Shadow DOM deep querying not yet specialized.
