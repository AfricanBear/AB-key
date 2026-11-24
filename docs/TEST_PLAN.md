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

- Config saved on the options page reaches open Abacum tabs without reload (`storage.onChanged`).
- Extension update migrates the stored config and removes the old `mv3ClickAutomation.logs` key.

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
- Pop out (⧉ next to ⚙️ in the A+B key panel):
  - Click ⧉ on a model page: a small window without address bar opens with the same list; the in-page panel closes.
  - The window has no ⧉ button and fits its height to the list; ⚙️ opens Options.
  - Switch to a dataset tab, then to a non-Abacum tab, then to another browser window with Abacum: the list follows Abacum tabs (rail labels for Alt+1–5 change), the non-Abacum tab keeps the last list.
  - Open an object or side panel in Abacum: rail labels in the window update within ~2 s.
  - Change a hotkey in Options and Save: the window updates without reopening.
  - Click ⧉ again from another tab: the open window is focused, no second window.
  - Move / widen the window, close it, pop out again: it opens at the same place and width.
- Tab title: on any Abacum page the tab reads "<client> | <page> - Abacum", with the client name from the organization switcher at the bottom left (not an emoji or icon name); it updates on in-app navigation.
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
- f chip → transformation step (Options → Features, on by default; a dataset with several transformations, Viewer tab, Transform panel open):
  - Click the f chip of a transformed column: Abacum shows the column in the panel header and highlights it, and the step for that column gets the check mark in the list. With two steps for one column, the later one is selected.
  - Hover the f chip: background darker blue with a thin ring, tooltip "Show transformation step"; pressed: darker still. Other chips and icons in the header unchanged.
  - Click the column name or a cell: no step changes (sorting and the selection sum work as before).
  - Transform panel closed (another panel or none): the chip does what Abacum does, nothing else.
  - Step Edit dialog open: the header cannot be clicked; Cancel leaves Save disabled.
  - Off: the list selection does not move, no hover state, no new tooltips; switching applies to open tabs without reload.
  - Options: the toggle text shows the blue f icon.
- Left navigation (Alt+Shift+1–9, any Abacum page):
  - Alt+Shift+1 Spaces, 2 Models, 3 Versions, 4 Dimensions, 5 Datasets, 6 Integrations (order as in the sidebar after Library).
  - Alt+Shift+7–9 do nothing while there are only six links; "More" is never opened.
  - With a physical keyboard: Alt+Shift does not switch the Windows input language instead.
  - A+B key panel lists "Go to Spaces" … "Go to Integrations".
  - Hovering a numbered link shows "Models · Alt+Shift+2" etc.; Library, More, Help & support tooltips are unchanged.
- Alt+Q: opens the AI chat; pressed again (also with the cursor in the chat input) closes it.
- Alt+H: opens Abacum Academy in a new tab; the Help & support menu does not stay open.
- Alt+R (models): click any cell of a variable row, Alt+R → the name field opens with the current name, caret at the end, and no row menu flashes; Esc cancels, Save stays disabled. Without a focused variable row nothing happens.
- Alt+C (models) — use a test model, Abacum saves the copy at once:
  - Focused row: creates "<name> (1)". Delete it afterwards (row menu → Delete variable) and press Save.
  - Ticked rows: uses the bulk "Duplicate (n)" button instead of the row menu.
  - No focused or ticked row: nothing happens.
- Dimensions toggle (Options → Features → Models, on by default; any model, nothing to save):
  - A third button after the ƒ and # toggles, with the Dimensions icon of the right panel; off by default.
  - On: purple chips under each variable name (three, then "+N"; hovering "+N" pops up the hidden ones at once, one per line, below it or above near the window bottom; scrolling the grid hides it), "no dimensions" where empty; variable rows taller, group rows unchanged; Save stays disabled; the right panel does not open.
  - Scroll down / expand a group: new rows get chips. Change row density: rows stay tall enough.
  - Off: chips gone, Abacum's row height back. Another model and another tab follow the same switch.
  - Feature off in Options: no button, no chips.
- Alt+G (models) — use a test model and do not press Save:
  - Focused row, Info panel closed: Info opens on that variable, a few seconds later the description is replaced, Save becomes active. Reload: the old description is back.
  - Focused row, Info panel already open: same, the panel is not closed.
  - No focused row (Info shows the model): nothing happens.
- Alt+X (models) — use a test model and do not press Save:
  - Focused row of a variable no formula uses: the row disappears, Save becomes active; reload the page to get it back.
  - Focused row of a variable other formulas use: Abacum shows a red toast naming them; nothing is deleted.
  - Ticked rows: uses the bulk "Delete (n)" button instead of the row menu.
  - No focused or ticked row, or not on a model page: nothing happens.
- Save after deleting a new unnamed variable (Options → Features, on by default; Models, use a test model):
  - "+" on a group → Create variable, do not type a name, delete the row (right-click → Delete variable, or Alt+X); Abacum's "variable without a name" toast is expected. Create another variable with a name, Save: "Successfully updated the model"; after reload the named variable is there.
  - Delete a saved variable, Save, **reload**: the variable is gone (a real deletion is not dropped).
  - Off: the first scenario fails on Save with "Variable marked for deletion does not exist or could not be found" (Abacum's behaviour); switching applies to open tabs without reload.
- Esc in Edit Dimensions (Dimensions panel → edit): Abacum closes the dialog itself; unapplied changes are discarded without a prompt (Abacum behaviour, not AB-key).
- Model-only hotkeys (Alt+E, Alt+A, Alt+R, Alt+C, Alt+X):
  - On `/app/modules*`: listed in the A+B key panel and working.
  - On Datasets, Dimensions, Versions: not listed in the panel; pressing them does nothing.
  - Alt+S and Alt+1–5 remain listed and working on all Abacum pages.
- Alt+E (Edit Dimensions, Models builder):
  - With the variable's dimensions button visible: opens the dimensions modal (`module-builder-dbv-modal`).
  - Without that button on the page (or while the modal is open): nothing is clicked — in particular not "Show Builder Formulas".
- Guide (Options → Guide; start with **Show all tips again**):
  - Open a model: after ~2 s a centred "AB-key tips" card, then Next walks the left nav link, the first right toolbar button, the AI chat button, Help & support, Save, a variable name, the Dimensions toggle; each with a purple ring and the tip inside the window. Counter "n / N", Back works.
  - × on a tip: the rest of the page's tips do not come back after reload. Open a dataset Viewer: pin, a data cell and an f chip get tips (the general ones are not repeated).
  - Open the Dimensions panel on a model: an Edit dimensions tip appears; open the formula editor: a Ctrl+Backspace tip appears and typing still works (the tip never takes focus).
  - No tip opens over an Abacum dialog or menu, or while the A+B key panel is open.
  - Rebind Alt+S in the JSON: the Save tip shows the new key. Switch a feature off: its tip is gone.
  - "Turn off tips": the guide toggle in Options is off after reload of Options; no tips. The panel's ? still shows all tips of the page (no "Turn off tips" link in that mode); ? on a non-Abacum page is hidden; ? from the pop-out window focuses the Abacum tab and shows them there.
  - Only new features on, with `abKey.guide.baseline` "1.5.0" (set in the service worker console): only the variable row and Dimensions toggle tips, with "New".
- Extension reload / update keeps the saved configuration (not reset to defaults).
- Options → Advanced → Configuration (JSON is what Save stores):
  - Collapsed on first open; open it, reload Options: still open; close it, reload: closed. A failed Save opens it.
  - Switching a toggle changes its flag in the JSON at once; Save marks one change, not two.
  - Typing a flag in the JSON (e.g. `"diagnosticsEnabled": true`) moves its toggle; half-typed JSON leaves toggles alone, and clicking a toggle then shows "Fix the JSON below first".
  - Export, flip a few toggles, Import the file: toggles show the file's flags; Save keeps them.
  - Import a non-config file: red error, nothing saved.
  - Save with a hotkey bound to a missing action, a disabled action, a key without Alt/Ctrl/Meta, or a key used twice on the same pages: saved, with a yellow warning per hotkey; shipped defaults save with no warning.
  - Diagnostics on: with the console at **Verbose**, a hotkey logs `[AB-key]` lines and outlines the clicked element in pink.

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
