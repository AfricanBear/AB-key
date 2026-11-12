import { ErrorCode, ExtensionError } from "./errors.js";

export const CURRENT_CONFIG_VERSION = 2;
export const CONFIG_KEY = "mv3ClickAutomation.config";

const ABACUM_HOSTS = ["app.abacum.io"];

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

// v1 label-based rail actions, replaced by positional rail actions in v2.
const LEGACY_RAIL_ACTION_IDS = ["action.info", "action.dimensions", "action.settings", "action.activity", "action.toolbar5"];

export const DEFAULT_CONFIG = {
  configVersion: CURRENT_CONFIG_VERSION,
  diagnosticsEnabled: false,
  abacumTabTitleEnabled: true,
  lightThemeNavEnabled: false,
  commandBindings: {
    run_primary_action: "action.primary"
  },
  hotkeys: [
    ...RAIL_POSITIONS.map(buildRailHotkey),
    { key: "alt+e", actionId: "action.bulkDimensions", hosts: [...ABACUM_HOSTS] },
    { key: "alt+s", actionId: "action.save", hosts: [...ABACUM_HOSTS] },
    { key: "alt+a", actionId: "action.addCreate", hosts: [...ABACUM_HOSTS] },
    { key: "alt+c", actionId: "action.createSection", hosts: [...ABACUM_HOSTS] }
  ],
  actions: [
    {
      // Generic example bound to the browser command. Disabled by default: with scope "*"
      // it would click submit buttons on any website.
      actionId: "action.primary",
      label: "Primary Action",
      enabled: false,
      scope: { hosts: [...ABACUM_HOSTS] },
      locatorProfile: {
        selectorCandidates: ["button[data-testid='submit']", "button[type='submit']"],
        textCriteria: { mode: "contains", value: "Submit", caseSensitive: false },
        ariaCriteria: { label: "Submit", role: "button", caseSensitive: false },
        indexHint: 0
      },
      executionPolicy: {
        timeoutMs: 2500,
        retryPolicy: { attempts: 5, intervalMs: 200, useMutationObserver: true },
        postClickValidation: { strategy: "none" }
      }
    },
    ...RAIL_POSITIONS.map(buildRailAction),
    {
      actionId: "action.bulkDimensions",
      label: "Bulk Dimensions",
      enabled: true,
      scope: { hosts: [...ABACUM_HOSTS] },
      locatorProfile: {
        selectorCandidates: [".MuiIconButton-root[data-testid='testid-builder-bulk-dimensions']"],
        ariaCriteria: { role: "button", caseSensitive: false }
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
      locatorProfile: {
        selectorCandidates: [".MuiButton-root.MuiButton-containedPrimary"],
        textCriteria: { mode: "contains", value: "Save", caseSensitive: false },
        ariaCriteria: { role: "button", caseSensitive: false }
      },
      executionPolicy: { timeoutMs: 2000, retryPolicy: { attempts: 6, intervalMs: 200, useMutationObserver: true } }
    },
    {
      actionId: "action.addCreate",
      label: "Add then Create",
      enabled: true,
      scope: { hosts: [...ABACUM_HOSTS] },
      locatorProfile: {
        selectorCandidates: [".builder-create-from-anywhere-button", ".MuiIconButton-root.builder-create-from-anywhere-button"],
        ariaCriteria: { role: "button", caseSensitive: false }
      },
      executionPolicy: {
        timeoutMs: 3500,
        retryPolicy: { attempts: 10, intervalMs: 200, useMutationObserver: true },
        steps: [
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
        ]
      }
    },
    {
      actionId: "action.createSection",
      label: "Create Section",
      enabled: true,
      scope: { hosts: [...ABACUM_HOSTS] },
      locatorProfile: {
        selectorCandidates: [".MuiMenu-list button"],
        textCriteria: { mode: "exact", value: "Create section", caseSensitive: false },
        ariaCriteria: { role: "button", caseSensitive: false }
      },
      executionPolicy: { timeoutMs: 3000, retryPolicy: { attempts: 8, intervalMs: 200, useMutationObserver: true } }
    }
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
  if (typeof next.abacumTabTitleEnabled !== "boolean") next.abacumTabTitleEnabled = DEFAULT_CONFIG.abacumTabTitleEnabled;
  if (typeof next.lightThemeNavEnabled !== "boolean") next.lightThemeNavEnabled = DEFAULT_CONFIG.lightThemeNavEnabled;
  if (typeof next.diagnosticsEnabled !== "boolean") next.diagnosticsEnabled = DEFAULT_CONFIG.diagnosticsEnabled;
  validateConfigShape(next);
  return next;
}
