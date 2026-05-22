import { ErrorCode, ExtensionError } from "./errors.js";

export const CURRENT_CONFIG_VERSION = 1;
export const CONFIG_KEY = "mv3ClickAutomation.config";

export const DEFAULT_CONFIG = {
  configVersion: CURRENT_CONFIG_VERSION,
  diagnosticsEnabled: false,
  abacumTabTitleEnabled: true,
  lightThemeNavEnabled: false,
  commandBindings: {
    run_primary_action: "action.primary",
    run_secondary_action: "action.secondary"
  },
  hotkeys: [
    { key: "alt+1", actionId: "action.info", hosts: ["app.abacum.io"] },
    { key: "alt+2", actionId: "action.dimensions", hosts: ["app.abacum.io"] },
    { key: "alt+3", actionId: "action.settings", hosts: ["app.abacum.io"] },
    { key: "alt+4", actionId: "action.activity", hosts: ["app.abacum.io"] },
    { key: "alt+e", actionId: "action.bulkDimensions", hosts: ["app.abacum.io"] },
    { key: "alt+s", actionId: "action.save", hosts: ["app.abacum.io"] },
    { key: "alt+a", actionId: "action.addCreate", hosts: ["app.abacum.io"] },
    { key: "alt+c", actionId: "action.createSection", hosts: ["app.abacum.io"] }
  ],
  actions: [
    {
      actionId: "action.primary",
      label: "Primary Action",
      enabled: true,
      scope: { hosts: ["*"] },
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
    {
      actionId: "action.info",
      label: "Open Info",
      enabled: true,
      scope: { hosts: ["app.abacum.io"] },
      locatorProfile: {
        selectorCandidates: [".MuiIconButton-root[aria-label='Info']"],
        ariaCriteria: { label: "Info", role: "button", caseSensitive: false }
      },
      executionPolicy: { timeoutMs: 2000, retryPolicy: { attempts: 6, intervalMs: 200, useMutationObserver: true } }
    },
    {
      actionId: "action.dimensions",
      label: "Open Dimensions",
      enabled: true,
      scope: { hosts: ["app.abacum.io"] },
      locatorProfile: {
        selectorCandidates: [".MuiIconButton-root[aria-label='Dimensions']"],
        ariaCriteria: { label: "Dimensions", role: "button", caseSensitive: false }
      },
      executionPolicy: { timeoutMs: 2000, retryPolicy: { attempts: 6, intervalMs: 200, useMutationObserver: true } }
    },
    {
      actionId: "action.settings",
      label: "Open Settings",
      enabled: true,
      scope: { hosts: ["app.abacum.io"] },
      locatorProfile: {
        selectorCandidates: [".MuiIconButton-root[aria-label='Settings']"],
        ariaCriteria: { label: "Settings", role: "button", caseSensitive: false }
      },
      executionPolicy: { timeoutMs: 2000, retryPolicy: { attempts: 6, intervalMs: 200, useMutationObserver: true } }
    },
    {
      actionId: "action.activity",
      label: "Open Activity",
      enabled: true,
      scope: { hosts: ["app.abacum.io"] },
      locatorProfile: {
        selectorCandidates: [".MuiIconButton-root[aria-label='Activity']"],
        ariaCriteria: { label: "Activity", role: "button", caseSensitive: false }
      },
      executionPolicy: { timeoutMs: 2000, retryPolicy: { attempts: 6, intervalMs: 200, useMutationObserver: true } }
    },
    {
      actionId: "action.bulkDimensions",
      label: "Bulk Dimensions",
      enabled: true,
      scope: { hosts: ["app.abacum.io"] },
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
      scope: { hosts: ["app.abacum.io"] },
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
      scope: { hosts: ["app.abacum.io"] },
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
      scope: { hosts: ["app.abacum.io"] },
      locatorProfile: {
        selectorCandidates: [".MuiMenu-list button"],
        textCriteria: { mode: "exact", value: "Create section", caseSensitive: false },
        ariaCriteria: { role: "button", caseSensitive: false }
      },
      executionPolicy: { timeoutMs: 3000, retryPolicy: { attempts: 8, intervalMs: 200, useMutationObserver: true } }
    }
  ]
};

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
}

export function migrateConfig(rawConfig) {
  if (!rawConfig) return { ...DEFAULT_CONFIG };
  const version = rawConfig.configVersion ?? 0;
  let next = rawConfig;
  if (version < 1) {
    next = { ...DEFAULT_CONFIG, ...rawConfig, configVersion: 1 };
  }
  if (typeof next.abacumTabTitleEnabled !== "boolean") {
    next = { ...next, abacumTabTitleEnabled: DEFAULT_CONFIG.abacumTabTitleEnabled };
  }
  if (typeof next.lightThemeNavEnabled !== "boolean") {
    next = { ...next, lightThemeNavEnabled: DEFAULT_CONFIG.lightThemeNavEnabled };
  }
  validateConfigShape(next);
  return next;
}
