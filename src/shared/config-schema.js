import { ErrorCode, ExtensionError } from "./errors.js";

export const CURRENT_CONFIG_VERSION = 11;
export const CONFIG_KEY = "mv3ClickAutomation.config";

const ABACUM_HOSTS = ["app.abacum.io"];
// Abacum model pages (https://app.abacum.io/app/modules*). Hotkeys with "paths" fire and are
// listed in the A+B key panel only on pages whose pathname starts with one of the prefixes.
const MODEL_PATHS = ["/app/modules"];
const MODEL_ONLY_ACTION_IDS = ["action.bulkDimensions", "action.addCreate"];

// Right toolbar rail (Alt+1–5). Buttons are addressed by position (top to bottom),
// because the rail content differs by Abacum object type. See src/content/toolbar-rail.js.
export const RAIL_POSITIONS = [1, 2, 3, 4, 5];
export const railActionId = (position) => `action.rail${position}`;
export const isRailActionId = (actionId) => /^action\.rail[1-9]$/.test(actionId || "");

const RAIL_EXECUTION_POLICY = {
  timeoutMs: 1500,
  retryPolicy: { attempts: 6, intervalMs: 200, useMutationObserver: true }
};

function buildRailAction(position) {
  return {
    actionId: railActionId(position),
    label: `Rail button ${position}`,
    enabled: true,
    scope: { hosts: [...ABACUM_HOSTS] },
    locatorProfile: { toolbarRail: { position } },
    executionPolicy: structuredClone(RAIL_EXECUTION_POLICY)
  };
}

function buildRailHotkey(position) {
  return { key: `alt+${position}`, actionId: railActionId(position), hosts: [...ABACUM_HOSTS] };
}

// Left navigation (Alt+Shift+1–9): section links after "Library", by position, "More"
// skipped. See src/content/sidebar-nav.js. Positions beyond the current number of links
// do nothing, so new Abacum sections get a hotkey without a config change.
export const NAV_POSITIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
export const navActionId = (position) => `action.nav${position}`;
export const isNavActionId = (actionId) => /^action\.nav[1-9]$/.test(actionId || "");

function buildNavAction(position) {
  return {
    actionId: navActionId(position),
    label: `Navigation link ${position}`,
    enabled: true,
    scope: { hosts: [...ABACUM_HOSTS] },
    locatorProfile: { sidebarNav: { position } },
    executionPolicy: { timeoutMs: 1000, retryPolicy: { attempts: 3, intervalMs: 200, useMutationObserver: true } }
  };
}

function buildNavHotkey(position) {
  return { key: `alt+shift+${position}`, actionId: navActionId(position), hosts: [...ABACUM_HOSTS] };
}

// v1 label-based rail actions, replaced by positional rail actions in v2.
const LEGACY_RAIL_ACTION_IDS = ["action.info", "action.dimensions", "action.settings", "action.activity", "action.toolbar5"];

// Alt+E: Abacum's "edit dimensions" button in the model builder. The data-testid is stable;
// the MUI class is not, and a bare { role: "button" } matched any button on the page.
const BULK_DIMENSIONS_SELECTOR = "[data-testid='testid-builder-bulk-dimensions']";
const LEGACY_BULK_DIMENSIONS_SELECTOR = ".MuiIconButton-root[data-testid='testid-builder-bulk-dimensions']";

// Alt+S: Save in an open dialog first, then the model builder Save button (stable test id).
// The previous generic search stays as the fallback, so Alt+S keeps working on other pages.
const SAVE_LOCATOR = {
  preferredSelectors: [
    "[role='dialog'] .MuiButton-containedPrimary",
    "[data-testid='testid-builder-save-button']"
  ],
  selectorCandidates: [".MuiButton-root.MuiButton-containedPrimary"],
  textCriteria: { mode: "contains", value: "Save", caseSensitive: false },
  ariaCriteria: { role: "button", caseSensitive: false }
};
const LEGACY_SAVE_LOCATOR = {
  selectorCandidates: [".MuiButton-root.MuiButton-containedPrimary"],
  textCriteria: { mode: "contains", value: "Save", caseSensitive: false },
  ariaCriteria: { role: "button", caseSensitive: false }
};

// Alt+A: "+" button (stable test id), then exactly "Create variable" in its menu.
// The menu also has "Create group" and "Create section"; "contains Create" matched all three.
const ADD_MENU = "[data-testid='testid-builder-add-dropdown-anywhere']";
const ADD_CREATE_STEPS = [
  {
    locatorProfile: {
      preferredSelectors: ["[data-testid='testid-builder-add-button-anywhere']"],
      selectorCandidates: [".builder-create-from-anywhere-button"],
      ariaCriteria: { role: "button", caseSensitive: false }
    }
  },
  {
    locatorProfile: {
      preferredSelectors: [`${ADD_MENU} [role='menuitem']`, `${ADD_MENU} li`],
      selectorCandidates: [".MuiMenuItem-root"],
      textCriteria: { mode: "exact", value: "Create variable", caseSensitive: false },
      ariaCriteria: { role: "menuitem", caseSensitive: false }
    }
  }
];
const LEGACY_ADD_CREATE_STEPS = [
  {
    locatorProfile: {
      selectorCandidates: [".builder-create-from-anywhere-button"],
      ariaCriteria: { role: "button", caseSensitive: false }
    }
  },
  {
    locatorProfile: {
      selectorCandidates: [".MuiMenuItem-root"],
      textCriteria: { mode: "contains", value: "Create", caseSensitive: false },
      ariaCriteria: { role: "menuitem", caseSensitive: false }
    }
  }
];

// Alt+Q: AI chat toggle (bottom of the right rail; a second click closes the chat).
const AI_CHAT_ACTION = {
  actionId: "action.aiChat",
  label: "AI chat",
  enabled: true,
  scope: { hosts: [...ABACUM_HOSTS] },
  locatorProfile: { preferredSelectors: ["button[data-testid='toolbar-rail-button-ai-agent']"], preferredOnly: true },
  executionPolicy: { timeoutMs: 1500, retryPolicy: { attempts: 6, intervalMs: 200, useMutationObserver: true } }
};

// Alt+H: Help & support -> "Abacum Academy" (Abacum opens academy.abacum.io in a new tab).
const HELP_MENU_ITEMS = "[data-testid='help-and-support-contextual-menu'] [role='menuitem']";
const ACADEMY_STEPS = [
  { locatorProfile: { preferredSelectors: ["[data-testid='sidebar-section-button-HelpAndSupport']"], preferredOnly: true } },
  {
    locatorProfile: {
      preferredSelectors: [HELP_MENU_ITEMS],
      textCriteria: { mode: "exact", value: "Abacum Academy", caseSensitive: false },
      preferredOnly: true
    }
  }
];

// Alt+R / Alt+C: the focused variable row's context menu (right-click on its name cell).
// AG Grid marks the focused row in every column container with ag-row-focus; the name cell
// lives in the pinned-left one.
const FOCUSED_VARIABLE_NAME = ".ag-row.variable-row.ag-row-focus [col-id='name']";
const ROW_MENU_ITEMS = "[data-testid='mb-contextual-menu'] [role='menuitem']";
const rowMenuSteps = (item) => [
  { trigger: "contextmenu", locatorProfile: { preferredSelectors: [FOCUSED_VARIABLE_NAME], preferredOnly: true } },
  {
    locatorProfile: {
      preferredSelectors: [ROW_MENU_ITEMS],
      textCriteria: { mode: "exact", value: item, caseSensitive: false },
      preferredOnly: true
    }
  }
];
const ROW_ACTION_POLICY = { timeoutMs: 2000, retryPolicy: { attempts: 8, intervalMs: 200, useMutationObserver: true } };

// Shipped in v7-v10: right-click, then "Rename variable". Kept to recognise it in migrateV10ToV11.
const LEGACY_RENAME_VARIABLE_ACTION = {
  actionId: "action.renameVariable",
  label: "Rename variable",
  enabled: true,
  scope: { hosts: [...ABACUM_HOSTS] },
  // Unused while executionPolicy.steps is set; kept for the schema (required field).
  locatorProfile: structuredClone(rowMenuSteps("Rename variable")[0].locatorProfile),
  executionPolicy: { ...structuredClone(ROW_ACTION_POLICY), steps: rowMenuSteps("Rename variable") }
};

// Double-clicking the name cell opens the same rename field as the menu, without the menu round
// trip; Abacum puts the caret at the end of the name.
const RENAME_STEPS = [{ trigger: "dblclick", locatorProfile: { preferredSelectors: [FOCUSED_VARIABLE_NAME], preferredOnly: true } }];
const RENAME_VARIABLE_ACTION = {
  ...structuredClone(LEGACY_RENAME_VARIABLE_ACTION),
  locatorProfile: structuredClone(RENAME_STEPS[0].locatorProfile),
  executionPolicy: { ...structuredClone(ROW_ACTION_POLICY), steps: structuredClone(RENAME_STEPS) }
};

// Duplicate is saved by Abacum immediately. Ticked rows (bulk toolbar) win over the focused row.
const BULK_DUPLICATE = "[data-testid='model-builder-bulk-actions-toolbar'] button[aria-label='duplicate-variables']";
const DUPLICATE_VARIABLE_ACTION = {
  actionId: "action.duplicateVariable",
  label: "Duplicate variable",
  enabled: true,
  scope: { hosts: [...ABACUM_HOSTS] },
  // Unused while executionPolicy.alternatives is set; kept for the schema (required field).
  locatorProfile: { preferredSelectors: [BULK_DUPLICATE], preferredOnly: true },
  executionPolicy: {
    ...structuredClone(ROW_ACTION_POLICY),
    alternatives: [
      { steps: [{ locatorProfile: { preferredSelectors: [BULK_DUPLICATE], preferredOnly: true } }] },
      { steps: rowMenuSteps("Duplicate variable") }
    ]
  }
};

// Alt+X: delete. Abacum applies it on Save (until then a reload brings the variable back) and
// refuses to delete a variable other formulas use (red toast). Ticked rows win over the focused row.
const BULK_DELETE = "[data-testid='model-builder-bulk-actions-toolbar'] button[aria-label='delete-variables']";
const DELETE_VARIABLE_ACTION = {
  actionId: "action.deleteVariable",
  label: "Delete variable",
  enabled: true,
  scope: { hosts: [...ABACUM_HOSTS] },
  // Unused while executionPolicy.alternatives is set; kept for the schema (required field).
  locatorProfile: { preferredSelectors: [BULK_DELETE], preferredOnly: true },
  executionPolicy: {
    ...structuredClone(ROW_ACTION_POLICY),
    alternatives: [
      { steps: [{ locatorProfile: { preferredSelectors: [BULK_DELETE], preferredOnly: true } }] },
      { steps: rowMenuSteps("Delete variable") }
    ]
  }
};

const ACADEMY_ACTION = {
  actionId: "action.academy",
  label: "Abacum Academy",
  enabled: true,
  scope: { hosts: [...ABACUM_HOSTS] },
  // Unused while executionPolicy.steps is set; kept for the schema (required field).
  locatorProfile: structuredClone(ACADEMY_STEPS[0].locatorProfile),
  executionPolicy: {
    timeoutMs: 2000,
    retryPolicy: { attempts: 8, intervalMs: 200, useMutationObserver: true },
    steps: structuredClone(ACADEMY_STEPS)
  }
};

// Added in schema v7 (hotkeys from the Notion backlog).
const V7_ACTIONS = [
  ...NAV_POSITIONS.map(buildNavAction),
  AI_CHAT_ACTION,
  ACADEMY_ACTION,
  RENAME_VARIABLE_ACTION,
  DUPLICATE_VARIABLE_ACTION
];
const V7_HOTKEYS = [
  ...NAV_POSITIONS.map(buildNavHotkey),
  { key: "alt+q", actionId: "action.aiChat", hosts: [...ABACUM_HOSTS] },
  { key: "alt+h", actionId: "action.academy", hosts: [...ABACUM_HOSTS] },
  { key: "alt+r", actionId: "action.renameVariable", hosts: [...ABACUM_HOSTS], paths: [...MODEL_PATHS] },
  { key: "alt+c", actionId: "action.duplicateVariable", hosts: [...ABACUM_HOSTS], paths: [...MODEL_PATHS] }
];

// Alt+G: regenerate the focused variable's description with Abacum's AI. Info drawer (opened if
// needed) -> Edit description -> AI generate. Abacum then replaces the text at once and closes
// the editor; the change waits for the model's Save (a reload without Save brings the old text
// back). AB-key never clicks Save. Only with a focused variable row: without one the drawer
// shows the model, whose description must not be touched.
const FOCUSED_ROW = ".ag-row.variable-row.ag-row-focus";
const EDIT_DESCRIPTION = "[data-testid='toolbar-drawer'] button[aria-label='Edit description']";
const AI_GENERATE = "[data-testid='ai-generate-description-button']";
const descriptionSteps = [
  { locatorProfile: { preferredSelectors: [EDIT_DESCRIPTION], preferredOnly: true } },
  { locatorProfile: { preferredSelectors: [AI_GENERATE], preferredOnly: true } }
];
const AI_DESCRIPTION_ACTION = {
  actionId: "action.aiDescription",
  label: "AI description (variable)",
  enabled: true,
  scope: { hosts: [...ABACUM_HOSTS] },
  // Unused while executionPolicy.alternatives is set; kept for the schema (required field).
  locatorProfile: { preferredSelectors: [AI_GENERATE], preferredOnly: true },
  executionPolicy: {
    timeoutMs: 3000,
    retryPolicy: { attempts: 12, intervalMs: 200, useMutationObserver: true },
    alternatives: [
      // Drawer already open on the focused variable.
      {
        steps: [
          { locatorProfile: { preferredSelectors: [`body:has(${FOCUSED_ROW}) ${EDIT_DESCRIPTION}`], preferredOnly: true } },
          descriptionSteps[1]
        ]
      },
      // Drawer closed: keep the row focused, open Info, then the same two clicks.
      {
        steps: [
          { locatorProfile: { preferredSelectors: [`${FOCUSED_ROW} [col-id='name']`], preferredOnly: true } },
          { locatorProfile: { preferredSelectors: ["button[data-testid='toolbar-rail-button-module-info']"], preferredOnly: true } },
          ...descriptionSteps
        ]
      }
    ]
  }
};

// Added in schema v9.
const V9_ACTIONS = [AI_DESCRIPTION_ACTION];
const V9_HOTKEYS = [{ key: "alt+g", actionId: "action.aiDescription", hosts: [...ABACUM_HOSTS], paths: [...MODEL_PATHS] }];

// Added in schema v8.
const V8_ACTIONS = [DELETE_VARIABLE_ACTION];
const V8_HOTKEYS = [{ key: "alt+x", actionId: "action.deleteVariable", hosts: [...ABACUM_HOSTS], paths: [...MODEL_PATHS] }];

export const DEFAULT_CONFIG = {
  configVersion: CURRENT_CONFIG_VERSION,
  diagnosticsEnabled: false,
  abacumTabTitleEnabled: true,
  lightThemeNavEnabled: false,
  darkerModelValuesEnabled: true,
  datasetSelectionSumEnabled: true,
  datasetPinColumnsEnabled: true,
  datasetTwoRowHeaderEnabled: true,
  formulaWordDeleteEnabled: true,
  datasetTransformLinkEnabled: true,
  unsavedVariableDeleteFixEnabled: true,
  modelDimensionsEnabled: true,
  // AB-key guide (src/content/ab-key-guide.js): tips at the buttons, and whether to show only
  // the features shipped after the version the user started with.
  guideEnabled: true,
  guideOnlyNew: false,
  hotkeys: [
    ...RAIL_POSITIONS.map(buildRailHotkey),
    { key: "alt+e", actionId: "action.bulkDimensions", hosts: [...ABACUM_HOSTS], paths: [...MODEL_PATHS] },
    { key: "alt+s", actionId: "action.save", hosts: [...ABACUM_HOSTS] },
    { key: "alt+a", actionId: "action.addCreate", hosts: [...ABACUM_HOSTS], paths: [...MODEL_PATHS] },
    ...structuredClone(V7_HOTKEYS),
    ...structuredClone(V8_HOTKEYS),
    ...structuredClone(V9_HOTKEYS)
  ],
  actions: [
    ...RAIL_POSITIONS.map(buildRailAction),
    {
      actionId: "action.bulkDimensions",
      label: "Bulk Dimensions",
      enabled: true,
      scope: { hosts: [...ABACUM_HOSTS] },
      locatorProfile: {
        selectorCandidates: [BULK_DIMENSIONS_SELECTOR]
      },
      executionPolicy: {
        timeoutMs: 2000,
        preActions: [{ type: "blurActiveElement" }],
        retryPolicy: { attempts: 8, intervalMs: 200, useMutationObserver: true }
      }
    },
    {
      actionId: "action.save",
      label: "Save",
      enabled: true,
      scope: { hosts: [...ABACUM_HOSTS] },
      locatorProfile: structuredClone(SAVE_LOCATOR),
      executionPolicy: { timeoutMs: 2000, retryPolicy: { attempts: 6, intervalMs: 200, useMutationObserver: true } }
    },
    {
      actionId: "action.addCreate",
      label: "Add then Create",
      enabled: true,
      scope: { hosts: [...ABACUM_HOSTS] },
      // Unused while executionPolicy.steps is set; kept for the schema (required field).
      locatorProfile: structuredClone(ADD_CREATE_STEPS[0].locatorProfile),
      executionPolicy: {
        timeoutMs: 3500,
        retryPolicy: { attempts: 10, intervalMs: 200, useMutationObserver: true },
        steps: structuredClone(ADD_CREATE_STEPS)
      }
    },
    ...structuredClone(V7_ACTIONS),
    ...structuredClone(V8_ACTIONS),
    ...structuredClone(V9_ACTIONS)
  ]
};

export function createDefaultConfig() {
  return structuredClone(DEFAULT_CONFIG);
}

export function validateConfigShape(config) {
  if (!config || typeof config !== "object") {
    throw new ExtensionError(ErrorCode.InvalidConfig, "Config must be an object.");
  }
  if (!Array.isArray(config.actions)) {
    throw new ExtensionError(ErrorCode.InvalidConfig, "Config.actions must be an array.");
  }
  if (config.hotkeys && !Array.isArray(config.hotkeys)) {
    throw new ExtensionError(ErrorCode.InvalidConfig, "Config.hotkeys must be an array.");
  }
  for (const action of config.actions) {
    if (!action.actionId || !action.locatorProfile || !action.executionPolicy) {
      throw new ExtensionError(ErrorCode.InvalidConfig, "Action is missing required fields.", { action });
    }
  }
  for (const hotkey of config.hotkeys || []) {
    if (!hotkey?.key || !hotkey?.actionId) {
      throw new ExtensionError(ErrorCode.InvalidConfig, "Hotkey is missing key or actionId.", { hotkey });
    }
    if (hotkey.paths !== undefined && (!Array.isArray(hotkey.paths) || hotkey.paths.some((p) => typeof p !== "string"))) {
      throw new ExtensionError(ErrorCode.InvalidConfig, "Hotkey paths must be an array of strings.", { hotkey });
    }
  }
}

// v1 -> v2: label-based rail actions (Info/Dimensions/Settings/Activity/toolbar5) become
// positional rail actions; the "experimental" toggle is gone; the generic "*" submit
// action is disabled. User-defined actions and non-rail hotkeys are kept as is.
function migrateV1ToV2(v1) {
  const next = structuredClone(v1);
  const legacyIds = new Set(LEGACY_RAIL_ACTION_IDS);
  const railKeys = new Set(RAIL_POSITIONS.map((p) => `alt+${p}`));

  next.actions = (next.actions || []).filter((action) => !legacyIds.has(action.actionId));
  for (const position of RAIL_POSITIONS) {
    if (!next.actions.some((action) => action.actionId === railActionId(position))) {
      next.actions.push(buildRailAction(position));
    }
  }

  next.hotkeys = (next.hotkeys || []).filter(
    (hotkey) => !legacyIds.has(hotkey.actionId) && !(railKeys.has(hotkey.key) && !isRailActionId(hotkey.actionId))
  );
  for (const position of RAIL_POSITIONS) {
    if (!next.hotkeys.some((hotkey) => hotkey.key === `alt+${position}`)) {
      next.hotkeys.push(buildRailHotkey(position));
    }
  }

  const primary = next.actions.find((action) => action.actionId === "action.primary");
  if (primary && (primary.scope?.hosts || ["*"]).includes("*")) {
    primary.enabled = false;
  }
  if (next.commandBindings?.run_secondary_action === "action.secondary" &&
      !next.actions.some((action) => action.actionId === "action.secondary")) {
    delete next.commandBindings.run_secondary_action;
  }
  delete next.experimentalFeaturesEnabled;

  next.configVersion = 2;
  return next;
}

// v2 -> v3: Alt+E selector no longer depends on the MUI class and drops the role-only aria
// criteria. Only touched if the user still has the shipped default selector.
function migrateV2ToV3(v2) {
  const next = structuredClone(v2);
  const action = next.actions.find((item) => item.actionId === "action.bulkDimensions");
  const profile = action?.locatorProfile;
  if (profile?.selectorCandidates?.length === 1 && profile.selectorCandidates[0] === LEGACY_BULK_DIMENSIONS_SELECTOR) {
    profile.selectorCandidates = [BULK_DIMENSIONS_SELECTOR];
    if (profile.ariaCriteria && !profile.ariaCriteria.label) delete profile.ariaCriteria;
  }
  next.configVersion = 3;
  return next;
}

const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// v3 -> v4: Alt+S and Alt+A use Abacum test ids. Only shipped defaults are replaced;
// locators the user edited are kept.
function migrateV3ToV4(v3) {
  const next = structuredClone(v3);
  const save = next.actions.find((item) => item.actionId === "action.save");
  if (save && sameJson(save.locatorProfile, LEGACY_SAVE_LOCATOR)) {
    save.locatorProfile = structuredClone(SAVE_LOCATOR);
  }
  const addCreate = next.actions.find((item) => item.actionId === "action.addCreate");
  if (addCreate && sameJson(addCreate.executionPolicy?.steps, LEGACY_ADD_CREATE_STEPS)) {
    addCreate.executionPolicy.steps = structuredClone(ADD_CREATE_STEPS);
    addCreate.locatorProfile = structuredClone(ADD_CREATE_STEPS[0].locatorProfile);
  }
  next.configVersion = 4;
  return next;
}

// v4 -> v5: Alt+C ("Create section") is removed. Its action and every hotkey bound to it
// are dropped; a user's own action on alt+c is kept.
const REMOVED_ACTION_IDS = ["action.createSection"];

function migrateV4ToV5(v4) {
  const next = structuredClone(v4);
  next.actions = next.actions.filter((action) => !REMOVED_ACTION_IDS.includes(action.actionId));
  next.hotkeys = (next.hotkeys || []).filter((hotkey) => !REMOVED_ACTION_IDS.includes(hotkey.actionId));
  next.configVersion = 5;
  return next;
}

// v5 -> v6: Alt+E and Alt+A only on model pages. Adds "paths" to hotkeys bound to these
// actions unless the user already set their own paths.
function migrateV5ToV6(v5) {
  const next = structuredClone(v5);
  for (const hotkey of next.hotkeys || []) {
    if (MODEL_ONLY_ACTION_IDS.includes(hotkey.actionId) && !Array.isArray(hotkey.paths)) {
      hotkey.paths = [...MODEL_PATHS];
    }
  }
  next.configVersion = 6;
  return next;
}

// v6 -> v7: hotkeys from the Notion backlog — Alt+Shift+1–9 (left navigation), Alt+Q (AI
// chat), Alt+H (Abacum Academy), Alt+R / Alt+C (rename / duplicate the focused variable).
// Missing actions are added; a hotkey is added only if the user has nothing on that key.
function migrateV6ToV7(v6) {
  const next = structuredClone(v6);
  next.hotkeys = next.hotkeys || [];
  for (const action of V7_ACTIONS) {
    if (!next.actions.some((item) => item.actionId === action.actionId)) next.actions.push(structuredClone(action));
  }
  for (const hotkey of V7_HOTKEYS) {
    if (!next.hotkeys.some((item) => item.key === hotkey.key)) next.hotkeys.push(structuredClone(hotkey));
  }
  next.configVersion = 7;
  return next;
}

// v7 -> v8: Alt+X deletes the focused (or ticked) variables. The action is added if missing;
// the hotkey only if the user has nothing on alt+x.
function migrateV7ToV8(v7) {
  const next = structuredClone(v7);
  next.hotkeys = next.hotkeys || [];
  for (const action of V8_ACTIONS) {
    if (!next.actions.some((item) => item.actionId === action.actionId)) next.actions.push(structuredClone(action));
  }
  for (const hotkey of V8_HOTKEYS) {
    if (!next.hotkeys.some((item) => item.key === hotkey.key)) next.hotkeys.push(structuredClone(hotkey));
  }
  next.configVersion = 8;
  return next;
}

// v8 -> v9: Alt+G regenerates the focused variable's AI description (stops before Save).
function migrateV8ToV9(v8) {
  const next = structuredClone(v8);
  next.hotkeys = next.hotkeys || [];
  for (const action of V9_ACTIONS) {
    if (!next.actions.some((item) => item.actionId === action.actionId)) next.actions.push(structuredClone(action));
  }
  for (const hotkey of V9_HOTKEYS) {
    if (!next.hotkeys.some((item) => item.key === hotkey.key)) next.hotkeys.push(structuredClone(hotkey));
  }
  next.configVersion = 9;
  return next;
}

// v9 -> v10: the browser command (run_primary_action) is gone, so "commandBindings" is dropped
// and so is the disabled "Submit" example action, unless a hotkey of the user still uses it.
const LEGACY_PRIMARY_ACTION_ID = "action.primary";

function migrateV9ToV10(v9) {
  const next = structuredClone(v9);
  delete next.commandBindings;
  const used = (next.hotkeys || []).some((hotkey) => hotkey.actionId === LEGACY_PRIMARY_ACTION_ID);
  if (!used) next.actions = next.actions.filter((action) => action.actionId !== LEGACY_PRIMARY_ACTION_ID);
  next.configVersion = 10;
  return next;
}

// v10 -> v11: Alt+R double-clicks the name instead of going through the row menu. Only the
// shipped action is replaced; one the user edited is kept.
function migrateV10ToV11(v10) {
  const next = structuredClone(v10);
  const index = next.actions.findIndex((action) => action.actionId === RENAME_VARIABLE_ACTION.actionId);
  if (index >= 0 && sameJson(next.actions[index], LEGACY_RENAME_VARIABLE_ACTION)) {
    next.actions[index] = structuredClone(RENAME_VARIABLE_ACTION);
  }
  next.configVersion = 11;
  return next;
}

/** Pure: never mutates rawConfig. */
export function migrateConfig(rawConfig) {
  if (!rawConfig) return createDefaultConfig();
  let next = structuredClone(rawConfig);
  const version = next.configVersion ?? 0;
  if (version < 1) {
    next = { ...createDefaultConfig(), ...next, configVersion: 1 };
  }
  if (version < 2) {
    next = migrateV1ToV2(next);
  }
  if (version < 3) {
    next = migrateV2ToV3(next);
  }
  if (version < 4) {
    next = migrateV3ToV4(next);
  }
  if (version < 5) {
    next = migrateV4ToV5(next);
  }
  if (version < 6) {
    next = migrateV5ToV6(next);
  }
  if (version < 7) {
    next = migrateV6ToV7(next);
  }
  if (version < 8) {
    next = migrateV7ToV8(next);
  }
  if (version < 9) {
    next = migrateV8ToV9(next);
  }
  if (version < 10) {
    next = migrateV9ToV10(next);
  }
  if (version < 11) {
    next = migrateV10ToV11(next);
  }
  if (typeof next.abacumTabTitleEnabled !== "boolean") next.abacumTabTitleEnabled = DEFAULT_CONFIG.abacumTabTitleEnabled;
  if (typeof next.lightThemeNavEnabled !== "boolean") next.lightThemeNavEnabled = DEFAULT_CONFIG.lightThemeNavEnabled;
  if (typeof next.darkerModelValuesEnabled !== "boolean") next.darkerModelValuesEnabled = DEFAULT_CONFIG.darkerModelValuesEnabled;
  if (typeof next.datasetSelectionSumEnabled !== "boolean") next.datasetSelectionSumEnabled = DEFAULT_CONFIG.datasetSelectionSumEnabled;
  if (typeof next.datasetPinColumnsEnabled !== "boolean") next.datasetPinColumnsEnabled = DEFAULT_CONFIG.datasetPinColumnsEnabled;
  if (typeof next.datasetTwoRowHeaderEnabled !== "boolean") next.datasetTwoRowHeaderEnabled = DEFAULT_CONFIG.datasetTwoRowHeaderEnabled;
  if (typeof next.formulaWordDeleteEnabled !== "boolean") next.formulaWordDeleteEnabled = DEFAULT_CONFIG.formulaWordDeleteEnabled;
  if (typeof next.datasetTransformLinkEnabled !== "boolean") next.datasetTransformLinkEnabled = DEFAULT_CONFIG.datasetTransformLinkEnabled;
  if (typeof next.modelDimensionsEnabled !== "boolean") next.modelDimensionsEnabled = DEFAULT_CONFIG.modelDimensionsEnabled;
  if (typeof next.unsavedVariableDeleteFixEnabled !== "boolean") {
    next.unsavedVariableDeleteFixEnabled = DEFAULT_CONFIG.unsavedVariableDeleteFixEnabled;
  }
  if (typeof next.guideEnabled !== "boolean") next.guideEnabled = DEFAULT_CONFIG.guideEnabled;
  if (typeof next.guideOnlyNew !== "boolean") next.guideOnlyNew = DEFAULT_CONFIG.guideOnlyNew;
  if (typeof next.diagnosticsEnabled !== "boolean") next.diagnosticsEnabled = DEFAULT_CONFIG.diagnosticsEnabled;
  validateConfigShape(next);
  return next;
}

// Hotkeys need a modifier: the content script ignores keydown without Alt, Ctrl or Meta.
const HOTKEY_MODIFIERS = ["alt", "ctrl", "meta"];

function rangesOverlap(a, b) {
  // No list means "everywhere"; otherwise two prefix lists overlap if one prefix starts the other.
  if (!Array.isArray(a) || !a.length || !Array.isArray(b) || !b.length) return true;
  return a.some((x) => b.some((y) => x.startsWith(y) || y.startsWith(x)));
}

function hostsOverlap(a, b) {
  const left = a || ["*"];
  const right = b || ["*"];
  if (left.includes("*") || right.includes("*")) return true;
  return left.some((x) => right.some((y) => x === y || x.endsWith(`.${y}`) || y.endsWith(`.${x}`)));
}

/**
 * Problems that do not make a config invalid but make a hotkey do nothing.
 * Pure; returns human-readable warnings for the options page.
 */
export function lintConfig(config) {
  const warnings = [];
  const hotkeys = config?.hotkeys || [];
  const actions = new Map((config?.actions || []).map((action) => [action.actionId, action]));

  hotkeys.forEach((hotkey, index) => {
    const parts = String(hotkey.key).toLowerCase().split("+");
    if (!parts.some((part) => HOTKEY_MODIFIERS.includes(part))) {
      warnings.push(`${hotkey.key}: needs Alt, Ctrl or Meta, otherwise it never fires.`);
    }
    const action = actions.get(hotkey.actionId);
    if (!action) {
      warnings.push(`${hotkey.key}: action "${hotkey.actionId}" does not exist.`);
    } else if (!action.enabled) {
      warnings.push(`${hotkey.key}: action "${hotkey.actionId}" is disabled ("enabled": false).`);
    }
    const shadowedBy = hotkeys
      .slice(0, index)
      .find(
        (earlier) =>
          earlier.key === hotkey.key && hostsOverlap(earlier.hosts, hotkey.hosts) && rangesOverlap(earlier.paths, hotkey.paths)
      );
    if (shadowedBy) {
      warnings.push(`${hotkey.key}: bound twice; where both apply, "${shadowedBy.actionId}" wins and "${hotkey.actionId}" does not fire.`);
    }
  });
  return warnings;
}
