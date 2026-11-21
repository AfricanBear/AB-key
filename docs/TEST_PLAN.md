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
- Alt+S:
  - Model builder with unsaved changes: clicks the builder Save button.
  - Dialog with a primary Save button open (e.g. dimensions modal): clicks Save in the dialog, not the builder Save behind it.
  - Other pages where Alt+S worked before: still works (fallback search).
- Alt+A (hover a row so "+" is visible): opens the menu and clicks exactly "Create variable", never "Create group" / "Create section".
- Selection sum in datasets (dataset → **Viewer** tab; the URL stays `/manager`):
  - Select 2+ numeric cells (click, then Shift+click): tooltip shows count, Sum and Avg at the bottom-right of the selection.
  - Mixed selection with dates/text: only numbers are counted.
  - Click a single cell: tooltip disappears.
  - Selection reaching the last rendered row while the grid can scroll: "Visible rows only".
  - Models: no AB-key tooltip (Abacum's own one is unchanged). Toggle off in Options: no tooltip.
- Version number: the A+B key panel and the Options page show "A+B key v<manifest version>" in the title.
- Pin columns in dataset Viewer (dataset → **Viewer** tab):
  - Hover a data column header: a grey pin appears left of the filter button; the service columns (checkbox, status) have none.
  - Click the pin: the column moves next to the checkbox column, the pin turns purple and stays visible; the header does not sort and does not start a drag.
  - Scroll right: pinned columns stay visible. Drag the edge of a pinned column: it resizes.
  - Resize any column, switch Loads → Viewer and reload the page: pinned columns and widths are restored.
  - Another dataset: its own pins (none at first). The Loads tab grid has no pins.
  - Pin wide columns until they would take > 60% of the grid: a "Not enough room" note, nothing pinned.
  - Click the pin again: unpinned. Options → Reset pinned columns and widths: pins removed on open tabs; widths return to defaults on the next Viewer open.
  - Toggle off in Options: pins removed from open tabs, no buttons. No requests to Abacum's API when pinning or resizing (Network tab).
- Two-row column headers in dataset Viewer (Options → Features, on by default):
  - Header is twice as tall; row 1: type icon, full name, sort arrow; row 2: pin, filter, options — visible without hover, no overlap.
  - Filter and options buttons still open their menus; clicking the name still sorts; drag and resize still work.
  - Loads → Viewer and reload: still two rows. The Loads tab and models keep one-row headers.
  - Off: one-row header again on open tabs; the pin (on hover) sits left of the filter button without covering it or the name.
- Light theme nav (Options → Features → Light theme nav):
  - Left icon column is light, icons dark; the logo sits on white; hovering an icon shows a light tint.
  - Current section in lavender: Spaces on a space, Models on the models list and on a model, Datasets on a dataset, Home on Agent hub. Search and More are never highlighted.
  - Clicking another section and the browser Back button move the highlight.
  - The right drawer (AI chat, Info / Dimensions panels) keeps Abacum's own look.
  - Off: Abacum's dark sidebar, no AB-key style left in the page.
- Darker values in model cells (Options → Features):
  - On (default): model values are near-black instead of grey; pencil icons unchanged.
  - Linked variables (arrow icon, e.g. "Variables From Other Models") and dimension rows after expand: values dark too, slightly lighter than editable ones (opacity 0.85 instead of Abacum's 0.4).
  - Off: Abacum's default grey; switching applies to open tabs without reload.
- Formula hints beside the Cell Editor (Models, double-click a Logic cell):
  - Operators list on open and Variable list after typing a letter appear to the right of the editor, top-aligned; the formula text is not covered.
  - Typing more letters and arrow keys: the list stays beside the editor.
  - Clicking a hint inserts it; the next list appears in the same place.
  - Editor near the right edge of a narrow window: list on the left of the editor.
  - Cancel / Apply / Esc: no AB-key work continues (no observers), Save state unchanged by the script.
  - Dataset selection-sum tooltip and other dropdowns unaffected.
- Ctrl+Backspace in formulas (Options → Features, on by default; Models, double-click a Logic cell):
  - Cursor at the end: each Ctrl+Backspace deletes one word / operator; a variable or value chip goes as a whole; the rest of the formula stays. Hints keep working.
  - Text selected: only the selection is deleted.
  - Ctrl+Delete deletes the next word; plain Backspace deletes one character; Cancel / Esc restores the formula, Save stays disabled.
  - Off: Ctrl+Backspace clears the whole formula again (Abacum's behaviour); switching applies to open tabs without reload.
- Left navigation (Alt+Shift+1–9, any Abacum page):
  - Alt+Shift+1 Spaces, 2 Models, 3 Versions, 4 Dimensions, 5 Datasets, 6 Integrations (order as in the sidebar after Library).
  - Alt+Shift+7–9 do nothing while there are only six links; "More" is never opened.
  - With a physical keyboard: Alt+Shift does not switch the Windows input language instead.
  - A+B key panel lists "Go to Spaces" … "Go to Integrations".
  - Hovering a numbered link shows "Models · Alt+Shift+2" etc.; Library, More, Help & support tooltips are unchanged.
- Alt+Q: opens the AI chat; pressed again (also with the cursor in the chat input) closes it.
- Alt+H: opens Abacum Academy in a new tab; the Help & support menu does not stay open.
- Alt+R (models): click any cell of a variable row, Alt+R → the name field opens with the current name; Esc cancels, Save stays disabled. Without a focused variable row nothing happens.
- Alt+C (models) — use a test model, Abacum saves the copy at once:
  - Focused row: creates "<name> (1)". Delete it afterwards (row menu → Delete variable) and press Save.
  - Ticked rows: uses the bulk "Duplicate (n)" button instead of the row menu.
  - No focused or ticked row: nothing happens.
- Esc in Edit Dimensions (Dimensions panel → edit): Abacum closes the dialog itself; unapplied changes are discarded without a prompt (Abacum behaviour, not AB-key).
- Model-only hotkeys (Alt+E, Alt+A, Alt+R, Alt+C):
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
