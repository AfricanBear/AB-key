// Tips of the AB-key guide (src/content/ab-key-guide.js), in the order they are shown.
//
// A step:
//   id       stable id; "seen" state is stored by id, so never reuse or rename one.
//   since    extension version that shipped the feature ("Only new features" compares it with
//            the version the user started with; a step newer than that gets a "New" badge).
//   page     "any" | "model" | "dataset"
//   flag     optional config flag that must be on (the feature's Options toggle).
//   anchor   () => Element | null: the element the tip points at; null = not on this page yet.
//            No anchor function = a centred card.
//   keys     optional action ids whose hotkeys are shown under the title (a run of numbered keys
//            becomes a range, e.g. Alt+1–5). The step is skipped when none of them is bound.
//   lines    optional [{ actionId, text, since? }]: one row per hotkey; unbound ones are left out.
//
// DOM verified Nov 2026 (see CLAUDE.md "Abacum DOM facts").
// Classic content script: no imports.
(function () {
  "use strict";

  if (globalThis.AbKeyGuideSteps) return;

  const visible = (element) => {
    if (!element?.getBoundingClientRect) return null;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 ? element : null;
  };
  const first = (selector) => {
    for (const element of document.querySelectorAll(selector)) {
      if (visible(element)) return element;
    }
    return null;
  };
  const range = (prefix, count) => Array.from({ length: count }, (_, index) => `action.${prefix}${index + 1}`);
  // The Viewer grid of a dataset (the Loads tab grid has no _abacum_type column).
  const VIEWER = '.ag-root-wrapper:has(.ag-header-cell[col-id="_abacum_type"])';

  globalThis.AbKeyGuideSteps = [
    {
      id: "welcome",
      since: "0.0.0",
      page: "any",
      title: "AB-key tips",
      text:
        "A few short tips show what AB-key adds to Abacum, page by page. Click the AB-key icon in the browser toolbar to see all hotkeys of the current page; the ? button there shows these tips again."
    },
    {
      id: "nav",
      since: "0.10.0",
      page: "any",
      anchor: () => visible(globalThis.AbKeySidebarNav?.listLinks?.()[0]?.button),
      title: "Jump between sections",
      keys: range("nav", 9),
      text: "Opens the sections below Library, top to bottom: the first key is the first section, and so on."
    },
    {
      id: "rail",
      since: "0.6.0",
      page: "any",
      anchor: () => visible(globalThis.AbKeyToolbarRail?.listButtons?.().buttons?.[0]),
      title: "Right toolbar buttons",
      keys: range("rail", 5),
      text: "Clicks the right toolbar buttons, top to bottom. Hover a button to see its key; the AB-key panel lists them for the current page."
    },
    {
      id: "aiChat",
      since: "0.10.0",
      page: "any",
      anchor: () => first('button[data-testid="toolbar-rail-button-ai-agent"]'),
      title: "AI chat",
      keys: ["action.aiChat"],
      text: "Opens or closes the AI chat, also from inside the chat input."
    },
    {
      id: "academy",
      since: "0.10.0",
      page: "any",
      anchor: () => first('button[data-testid="sidebar-section-button-HelpAndSupport"]'),
      title: "Abacum Academy",
      keys: ["action.academy"],
      text: "Opens Abacum Academy in a new tab."
    },
    {
      id: "modelSave",
      since: "0.6.2",
      page: "model",
      anchor: () => first('[data-testid="testid-builder-save-button"]'),
      title: "Save",
      keys: ["action.save"],
      text: "Saves the model, or clicks Save in an open dialog."
    },
    {
      id: "variableRow",
      since: "0.10.0",
      page: "model",
      anchor: () => first('.ag-row.variable-row [data-testid="drag-and-drop-cell"]'),
      title: "Variable hotkeys",
      text: "Click any cell of a variable row, then:",
      lines: [
        { actionId: "action.renameVariable", text: "Rename" },
        { actionId: "action.duplicateVariable", text: "Duplicate (saved at once)" },
        { actionId: "action.deleteVariable", text: "Delete (applied on Save)", since: "1.4.0" },
        { actionId: "action.aiDescription", text: "AI description", since: "1.5.0" },
        { actionId: "action.addCreate", text: "New variable", since: "0.5.0" }
      ]
    },
    {
      id: "modelDimensions",
      since: "1.6.0",
      page: "model",
      flag: "modelDimensionsEnabled",
      anchor: () => first('button[aria-label="Show Builder Dimensions"]'),
      title: "Dimensions under names",
      text: "Added by AB-key: shows each variable's dimensions as chips under its name. Hover \"+N\" for the rest. One switch for all models."
    },
    {
      id: "bulkDimensions",
      since: "0.5.0",
      page: "model",
      anchor: () => first('[data-testid="testid-builder-bulk-dimensions"]'),
      title: "Edit dimensions",
      keys: ["action.bulkDimensions"],
      text: "Opens Edit dimensions (the button is there while the Dimensions panel is open)."
    },
    {
      id: "formulaWordDelete",
      since: "1.2.0",
      page: "model",
      flag: "formulaWordDeleteEnabled",
      anchor: () => first('.ag-popup-editor [data-testid="testid-codemirror"]'),
      title: "Ctrl+Backspace deletes a word",
      text: "In the formula editor Ctrl+Backspace deletes the word left of the cursor (a variable chip as a whole) instead of clearing the whole formula."
    },
    {
      id: "datasetPin",
      since: "1.1.0",
      page: "dataset",
      flag: "datasetPinColumnsEnabled",
      anchor: () => first(`${VIEWER} .ab-key-pin-button`),
      title: "Pin columns",
      text: "Added by AB-key: click the pin in a column header to keep the column on the left while scrolling. Remembered per dataset."
    },
    {
      id: "datasetSum",
      since: "0.8.0",
      page: "dataset",
      flag: "datasetSelectionSumEnabled",
      anchor: () => first(`${VIEWER} .ag-center-cols-container .ag-cell`),
      title: "Selection sum",
      text: "Select two or more cells (click, then Shift+click) to see their count, Sum and Avg."
    },
    {
      id: "datasetTransformLink",
      since: "1.3.0",
      page: "dataset",
      flag: "datasetTransformLinkEnabled",
      anchor: () => {
        for (const chip of document.querySelectorAll('[aria-label="status-icon-container"] [data-testid="testid-abax-chip"]')) {
          if (chip.querySelector('[data-testid="function-icon"]') && visible(chip)) return chip;
        }
        return null;
      },
      title: "f → transformation step",
      text: "With the Transform panel open, click f in a column header to select the step that writes this column."
    }
  ];
})();
