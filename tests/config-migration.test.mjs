import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CURRENT_CONFIG_VERSION,
  createDefaultConfig,
  lintConfig,
  migrateConfig,
  validateConfigShape
} from "../src/shared/config-schema.js";
import { loadV1Config } from "./helpers.mjs";

const action = (config, id) => config.actions.find((item) => item.actionId === id);
const hotkey = (config, key) => config.hotkeys.find((item) => item.key === key);
const RAIL_POSITIONS = [1, 2, 3, 4, 5];
const LEGACY_RAIL_IDS = ["action.info", "action.dimensions", "action.settings", "action.activity", "action.toolbar5"];

// Hotkeys and actions added in schema v7 (Notion backlog).
const V7_ACTION_IDS = [
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((position) => `action.nav${position}`),
  "action.aiChat",
  "action.academy",
  "action.renameVariable",
  "action.duplicateVariable"
];

// Added in schema v8.
const V8_ACTION_IDS = ["action.deleteVariable"];
const V9_ACTION_IDS = ["action.aiDescription"];

/** Stored config as an older version would have left it: migrate v1, then roll back the version. */
function storedAt(version, mutate = () => {}) {
  const config = migrateConfig(loadV1Config());
  config.configVersion = version;
  if (version < 9) {
    config.actions = config.actions.filter((item) => !V9_ACTION_IDS.includes(item.actionId));
    config.hotkeys = config.hotkeys.filter((item) => !V9_ACTION_IDS.includes(item.actionId));
  }
  if (version < 8) {
    config.actions = config.actions.filter((item) => !V8_ACTION_IDS.includes(item.actionId));
    config.hotkeys = config.hotkeys.filter((item) => !V8_ACTION_IDS.includes(item.actionId));
  }
  if (version < 7) {
    config.actions = config.actions.filter((item) => !V7_ACTION_IDS.includes(item.actionId));
    config.hotkeys = config.hotkeys.filter((item) => !V7_ACTION_IDS.includes(item.actionId));
  }
  mutate(config);
  return config;
}

test("defaults are valid and at the current version", () => {
  const config = createDefaultConfig();
  validateConfigShape(config);
  assert.equal(config.configVersion, CURRENT_CONFIG_VERSION);
  assert.deepEqual(migrateConfig(undefined), config);
  assert.notEqual(createDefaultConfig().actions, createDefaultConfig().actions, "returns a fresh copy");
});

test("default hotkeys: Alt+1-5, Alt+E, Alt+S, Alt+A, plus the v7 backlog keys", () => {
  const config = createDefaultConfig();
  for (const position of RAIL_POSITIONS) {
    assert.equal(hotkey(config, `alt+${position}`).actionId, `action.rail${position}`);
    assert.deepEqual(action(config, `action.rail${position}`).locatorProfile, { toolbarRail: { position } });
  }
  assert.equal(hotkey(config, "alt+e").actionId, "action.bulkDimensions");
  assert.equal(hotkey(config, "alt+s").actionId, "action.save");
  assert.equal(hotkey(config, "alt+a").actionId, "action.addCreate");
  assert.equal(hotkey(config, "alt+c").actionId, "action.duplicateVariable", "Alt+C is now Duplicate, not Create section");
  assert.equal(action(config, "action.createSection"), undefined);
  assert.equal(action(config, "action.primary"), undefined, "no submit-anywhere example action");
  assert.equal(config.commandBindings, undefined, "no browser command");
});

test("Alt+E and Alt+A are limited to model pages; Alt+S and Alt+1-5 are global", () => {
  const config = createDefaultConfig();
  assert.deepEqual(hotkey(config, "alt+e").paths, ["/app/modules"]);
  assert.deepEqual(hotkey(config, "alt+a").paths, ["/app/modules"]);
  for (const key of ["alt+s", "alt+1", "alt+5"]) assert.equal(hotkey(config, key).paths, undefined, key);
});

test("v1 -> current: rail becomes positional, user data is kept", () => {
  const v1 = loadV1Config();
  v1.experimentalFeaturesEnabled = true;
  v1.diagnosticsEnabled = true;
  v1.actions.push({ actionId: "action.mine", enabled: true, locatorProfile: { selectorCandidates: ["#x"] }, executionPolicy: {} });
  v1.hotkeys.push({ key: "alt+x", actionId: "action.mine", hosts: ["app.abacum.io"] });
  const before = JSON.stringify(v1);

  const migrated = migrateConfig(v1);

  assert.equal(JSON.stringify(v1), before, "input is not mutated");
  assert.equal(migrated.configVersion, CURRENT_CONFIG_VERSION);
  assert.equal(migrated.diagnosticsEnabled, true);
  assert.ok(!("experimentalFeaturesEnabled" in migrated));
  for (const id of LEGACY_RAIL_IDS) assert.equal(action(migrated, id), undefined, `${id} removed`);
  for (const position of RAIL_POSITIONS) {
    const bound = migrated.hotkeys.filter((item) => item.key === `alt+${position}`);
    assert.equal(bound.length, 1, `exactly one alt+${position}`);
    assert.equal(bound[0].actionId, `action.rail${position}`);
  }
  assert.ok(action(migrated, "action.mine"), "custom action kept");
  assert.ok(hotkey(migrated, "alt+x"), "custom hotkey kept");
  assert.equal(action(migrated, "action.primary"), undefined, "unused example action dropped");
  assert.equal(migrated.commandBindings, undefined);
  assert.equal(hotkey(migrated, "alt+c").actionId, "action.duplicateVariable", "old Alt+C gone, new one bound");
  assert.deepEqual(action(migrated, "action.bulkDimensions"), action(createDefaultConfig(), "action.bulkDimensions"));
  assert.deepEqual(action(migrated, "action.save"), action(createDefaultConfig(), "action.save"));
  assert.deepEqual(action(migrated, "action.addCreate"), action(createDefaultConfig(), "action.addCreate"));
});

test("migration is idempotent", () => {
  const migrated = migrateConfig(loadV1Config());
  assert.deepEqual(migrateConfig(migrated), migrated);
});

test("schema v0 (no version) is filled from defaults", () => {
  const migrated = migrateConfig({ actions: [] });
  assert.equal(migrated.configVersion, CURRENT_CONFIG_VERSION);
  assert.equal(migrated.hotkeys.filter((item) => /^alt\+[1-5]$/.test(item.key)).length, 5);
});

test("v2 -> v3: Alt+E drops the MUI class and the role-only aria", () => {
  const v2 = storedAt(2, (config) => {
    action(config, "action.bulkDimensions").locatorProfile = {
      selectorCandidates: [".MuiIconButton-root[data-testid='testid-builder-bulk-dimensions']"],
      ariaCriteria: { role: "button", caseSensitive: false }
    };
  });
  assert.deepEqual(action(migrateConfig(v2), "action.bulkDimensions").locatorProfile, {
    selectorCandidates: ["[data-testid='testid-builder-bulk-dimensions']"]
  });
  const custom = storedAt(2, (config) => {
    action(config, "action.bulkDimensions").locatorProfile = { selectorCandidates: ["#my-button"] };
  });
  assert.deepEqual(action(migrateConfig(custom), "action.bulkDimensions").locatorProfile.selectorCandidates, ["#my-button"]);
});

test("v3 -> v4: shipped Alt+S / Alt+A locators replaced, edited ones kept", () => {
  const v1 = loadV1Config();
  const v3 = storedAt(3, (config) => {
    action(config, "action.save").locatorProfile = structuredClone(action(v1, "action.save").locatorProfile);
    action(config, "action.addCreate").executionPolicy.steps = structuredClone(action(v1, "action.addCreate").executionPolicy.steps);
  });
  const migrated = migrateConfig(v3);
  assert.deepEqual(action(migrated, "action.save"), action(createDefaultConfig(), "action.save"));
  assert.deepEqual(action(migrated, "action.addCreate").executionPolicy.steps, action(createDefaultConfig(), "action.addCreate").executionPolicy.steps);

  const custom = storedAt(3, (config) => {
    action(config, "action.save").locatorProfile = { selectorCandidates: ["#mine"] };
  });
  assert.deepEqual(action(migrateConfig(custom), "action.save").locatorProfile, { selectorCandidates: ["#mine"] });
});

test("v4 -> v5: Alt+C action and all its bindings removed; own action on alt+c kept", () => {
  const withAltC = (config) => {
    config.actions.push({ actionId: "action.createSection", enabled: true, locatorProfile: {}, executionPolicy: {} });
    config.hotkeys.push({ key: "alt+c", actionId: "action.createSection", hosts: ["app.abacum.io"] });
    config.hotkeys.push({ key: "alt+shift+c", actionId: "action.createSection", hosts: ["app.abacum.io"] });
  };
  const migrated = migrateConfig(storedAt(4, withAltC));
  assert.equal(action(migrated, "action.createSection"), undefined);
  assert.ok(!migrated.hotkeys.some((item) => item.actionId === "action.createSection"));

  const own = migrateConfig(
    storedAt(4, (config) => {
      config.actions.push({ actionId: "action.mine", enabled: true, locatorProfile: { selectorCandidates: ["#x"] }, executionPolicy: {} });
      config.hotkeys.push({ key: "alt+c", actionId: "action.mine", hosts: ["app.abacum.io"] });
    })
  );
  assert.equal(hotkey(own, "alt+c").actionId, "action.mine");
});

test("v5 -> v6: model-only paths added unless the user set their own", () => {
  const v5 = storedAt(5, (config) => {
    for (const item of config.hotkeys) delete item.paths;
    hotkey(config, "alt+a").paths = ["/app/custom"];
  });
  const migrated = migrateConfig(v5);
  assert.deepEqual(hotkey(migrated, "alt+e").paths, ["/app/modules"]);
  assert.deepEqual(hotkey(migrated, "alt+a").paths, ["/app/custom"]);
  assert.equal(hotkey(migrated, "alt+s").paths, undefined);
});

test("validation rejects malformed configs", () => {
  assert.throws(() => validateConfigShape(null));
  assert.throws(() => validateConfigShape({ actions: "nope" }));
  assert.throws(() => validateConfigShape({ actions: [{ actionId: "a" }] }), /missing required fields/);
  assert.throws(() => validateConfigShape({ actions: [], hotkeys: [{ key: "alt+x" }] }), /missing key or actionId/);
  assert.throws(() => validateConfigShape({ actions: [], hotkeys: [{ key: "alt+x", actionId: "a", paths: "/app" }] }), /paths/);
});

// --- v7: hotkeys from the Notion backlog --------------------------------------------------

test("v7 defaults: Alt+Shift+1-9 nav, Alt+Q, Alt+H global; Alt+R, Alt+C model-only", () => {
  const config = createDefaultConfig();
  for (let position = 1; position <= 9; position += 1) {
    assert.equal(hotkey(config, `alt+shift+${position}`).actionId, `action.nav${position}`);
    assert.deepEqual(action(config, `action.nav${position}`).locatorProfile, { sidebarNav: { position } });
    assert.equal(hotkey(config, `alt+shift+${position}`).paths, undefined);
  }
  assert.equal(hotkey(config, "alt+q").actionId, "action.aiChat");
  assert.equal(hotkey(config, "alt+h").actionId, "action.academy");
  assert.equal(hotkey(config, "alt+q").paths, undefined);
  assert.equal(hotkey(config, "alt+h").paths, undefined);
  assert.deepEqual(hotkey(config, "alt+r"), { key: "alt+r", actionId: "action.renameVariable", hosts: ["app.abacum.io"], paths: ["/app/modules"] });
  assert.deepEqual(hotkey(config, "alt+c").paths, ["/app/modules"]);
  for (const id of ["action.aiChat", "action.academy", "action.renameVariable", "action.duplicateVariable"]) {
    assert.equal(action(config, id).enabled, true, id);
  }
  const keys = config.hotkeys.map((item) => item.key);
  assert.equal(new Set(keys).size, keys.length, "no key bound twice");
});

test("v6 -> v7: backlog hotkeys added; a key the user already uses is left alone", () => {
  const v6 = storedAt(6, (config) => {
    config.actions.push({ actionId: "action.mine", enabled: true, locatorProfile: { selectorCandidates: ["#x"] }, executionPolicy: {} });
    config.hotkeys.push({ key: "alt+q", actionId: "action.mine", hosts: ["app.abacum.io"] });
  });
  assert.equal(action(v6, "action.aiChat"), undefined, "fixture is a real v6 config");

  const migrated = migrateConfig(v6);
  assert.equal(migrated.configVersion, CURRENT_CONFIG_VERSION);
  assert.equal(hotkey(migrated, "alt+q").actionId, "action.mine", "user's Alt+Q kept");
  assert.equal(migrated.hotkeys.filter((item) => item.key === "alt+q").length, 1);
  assert.ok(action(migrated, "action.aiChat"), "action exists, just unbound");
  assert.equal(hotkey(migrated, "alt+h").actionId, "action.academy");
  assert.equal(hotkey(migrated, "alt+r").actionId, "action.renameVariable");
  assert.equal(hotkey(migrated, "alt+c").actionId, "action.duplicateVariable");
  assert.equal(hotkey(migrated, "alt+shift+1").actionId, "action.nav1");
  assert.deepEqual(action(migrated, "action.duplicateVariable"), action(createDefaultConfig(), "action.duplicateVariable"));
  assert.deepEqual(migrateConfig(migrated), migrated, "idempotent");
});

// --- v8: Alt+X deletes the variable ---------------------------------------------------------

test("v8 defaults: Alt+X deletes the ticked variables, else the focused one, on model pages only", () => {
  const config = createDefaultConfig();
  assert.deepEqual(hotkey(config, "alt+x"), { key: "alt+x", actionId: "action.deleteVariable", hosts: ["app.abacum.io"], paths: ["/app/modules"] });
  const del = action(config, "action.deleteVariable");
  assert.equal(del.enabled, true);
  const [bulk, row] = del.executionPolicy.alternatives;
  assert.deepEqual(bulk.steps[0].locatorProfile.preferredSelectors, [
    "[data-testid='model-builder-bulk-actions-toolbar'] button[aria-label='delete-variables']"
  ]);
  assert.equal(row.steps[0].trigger, "contextmenu");
  assert.deepEqual(row.steps[0].locatorProfile.preferredSelectors, [".ag-row.variable-row.ag-row-focus [col-id='name']"]);
  assert.equal(row.steps[1].locatorProfile.textCriteria.value, "Delete variable");
  assert.equal(row.steps[1].locatorProfile.textCriteria.mode, "exact");
  const keys = config.hotkeys.map((item) => item.key);
  assert.equal(new Set(keys).size, keys.length, "no key bound twice");
});

test("v7 -> v8: Alt+X added; a user's own Alt+X is left alone", () => {
  const v7 = storedAt(7);
  assert.equal(action(v7, "action.deleteVariable"), undefined, "fixture is a real v7 config");
  const migrated = migrateConfig(v7);
  assert.equal(migrated.configVersion, CURRENT_CONFIG_VERSION);
  assert.equal(hotkey(migrated, "alt+x").actionId, "action.deleteVariable");
  assert.deepEqual(action(migrated, "action.deleteVariable"), action(createDefaultConfig(), "action.deleteVariable"));
  assert.deepEqual(migrateConfig(migrated), migrated, "idempotent");

  const own = migrateConfig(
    storedAt(7, (config) => {
      config.actions.push({ actionId: "action.mine", enabled: true, locatorProfile: { selectorCandidates: ["#x"] }, executionPolicy: {} });
      config.hotkeys.push({ key: "alt+x", actionId: "action.mine", hosts: ["app.abacum.io"] });
    })
  );
  assert.equal(hotkey(own, "alt+x").actionId, "action.mine", "user's Alt+X kept");
  assert.equal(own.hotkeys.filter((item) => item.key === "alt+x").length, 1);
  assert.ok(action(own, "action.deleteVariable"), "action exists, just unbound");
});

// --- v9: Alt+G regenerates the AI description ------------------------------------------------

test("v9 defaults: Alt+G (models only) runs Edit description -> AI generate, never Save", () => {
  const config = createDefaultConfig();
  assert.deepEqual(hotkey(config, "alt+g"), { key: "alt+g", actionId: "action.aiDescription", hosts: ["app.abacum.io"], paths: ["/app/modules"] });
  const ai = action(config, "action.aiDescription");
  assert.equal(ai.enabled, true);
  const [open, closed] = ai.executionPolicy.alternatives;
  assert.match(open.steps[0].locatorProfile.preferredSelectors[0], /^body:has\(\.ag-row\.variable-row\.ag-row-focus\) .*Edit description/);
  assert.equal(closed.steps[0].locatorProfile.preferredSelectors[0], ".ag-row.variable-row.ag-row-focus [col-id='name']");
  assert.equal(closed.steps[1].locatorProfile.preferredSelectors[0], "button[data-testid='toolbar-rail-button-module-info']");
  for (const alternative of [open, closed]) {
    const last = alternative.steps.at(-1).locatorProfile.preferredSelectors[0];
    assert.equal(last, "[data-testid='ai-generate-description-button']", "ends at AI generate");
    assert.ok(alternative.steps.every((step) => !/save/i.test(JSON.stringify(step))), "never clicks Save");
  }
  const keys = config.hotkeys.map((item) => item.key);
  assert.equal(new Set(keys).size, keys.length, "no key bound twice");
});

test("v8 -> v9: Alt+G added; a user's own Alt+G is left alone", () => {
  const v8 = storedAt(8);
  assert.equal(action(v8, "action.aiDescription"), undefined, "fixture is a real v8 config");
  const migrated = migrateConfig(v8);
  assert.equal(migrated.configVersion, CURRENT_CONFIG_VERSION);
  assert.equal(hotkey(migrated, "alt+g").actionId, "action.aiDescription");
  assert.deepEqual(action(migrated, "action.aiDescription"), action(createDefaultConfig(), "action.aiDescription"));
  assert.deepEqual(migrateConfig(migrated), migrated, "idempotent");

  const own = migrateConfig(
    storedAt(8, (config) => {
      config.actions.push({ actionId: "action.mine", enabled: true, locatorProfile: { selectorCandidates: ["#x"] }, executionPolicy: {} });
      config.hotkeys.push({ key: "alt+g", actionId: "action.mine", hosts: ["app.abacum.io"] });
    })
  );
  assert.equal(hotkey(own, "alt+g").actionId, "action.mine", "user's Alt+G kept");
  assert.ok(action(own, "action.aiDescription"), "action exists, just unbound");
});

// --- v10: the browser command and its example action are gone ------------------------------

const PRIMARY = {
  actionId: "action.primary",
  label: "Primary Action",
  enabled: false,
  scope: { hosts: ["app.abacum.io"] },
  locatorProfile: { selectorCandidates: ["button[type='submit']"] },
  executionPolicy: { timeoutMs: 2500 }
};

test("v9 -> v10: commandBindings and the unused action.primary are dropped, the rest is kept", () => {
  const v9 = storedAt(9, (config) => {
    config.commandBindings = { run_primary_action: "action.primary" };
    config.actions.unshift(structuredClone(PRIMARY));
  });
  const migrated = migrateConfig(v9);
  assert.equal(migrated.configVersion, CURRENT_CONFIG_VERSION);
  assert.equal(migrated.commandBindings, undefined);
  assert.equal(action(migrated, "action.primary"), undefined);
  assert.deepEqual(migrated.hotkeys, v9.hotkeys);
  assert.deepEqual(migrated.actions, v9.actions.slice(1));
  assert.deepEqual(migrateConfig(migrated), migrated, "idempotent");
});

test("v9 -> v10: action.primary stays when a user hotkey uses it", () => {
  const migrated = migrateConfig(
    storedAt(9, (config) => {
      config.actions.unshift({ ...structuredClone(PRIMARY), enabled: true });
      config.hotkeys.push({ key: "alt+p", actionId: "action.primary", hosts: ["app.abacum.io"] });
    })
  );
  assert.equal(action(migrated, "action.primary").enabled, true);
});

// --- v11: Alt+R double-clicks the name instead of using the row menu -----------------------

const FOCUSED_NAME = ".ag-row.variable-row.ag-row-focus [col-id='name']";
const LEGACY_RENAME_STEPS = [
  { trigger: "contextmenu", locatorProfile: { preferredSelectors: [FOCUSED_NAME], preferredOnly: true } },
  {
    locatorProfile: {
      preferredSelectors: ["[data-testid='mb-contextual-menu'] [role='menuitem']"],
      textCriteria: { mode: "exact", value: "Rename variable", caseSensitive: false },
      preferredOnly: true
    }
  }
];
const legacyRename = () => ({
  actionId: "action.renameVariable",
  label: "Rename variable",
  enabled: true,
  scope: { hosts: ["app.abacum.io"] },
  locatorProfile: structuredClone(LEGACY_RENAME_STEPS[0].locatorProfile),
  executionPolicy: {
    timeoutMs: 2000,
    retryPolicy: { attempts: 8, intervalMs: 200, useMutationObserver: true },
    steps: structuredClone(LEGACY_RENAME_STEPS)
  }
});
const withRename = (version, rename) =>
  storedAt(version, (config) => {
    config.actions[config.actions.findIndex((item) => item.actionId === "action.renameVariable")] = rename;
  });

test("v10 -> v11: the shipped Alt+R menu action becomes a double-click on the name", () => {
  const v10 = withRename(10, legacyRename());
  const migrated = migrateConfig(v10);
  assert.equal(migrated.configVersion, 11);
  assert.deepEqual(action(migrated, "action.renameVariable"), action(createDefaultConfig(), "action.renameVariable"));
  assert.deepEqual(action(migrated, "action.renameVariable").executionPolicy.steps, [
    { trigger: "dblclick", locatorProfile: { preferredSelectors: [FOCUSED_NAME], preferredOnly: true } }
  ]);
  const others = (config) => config.actions.filter((item) => item.actionId !== "action.renameVariable");
  assert.deepEqual(others(migrated), others(v10));
  assert.deepEqual(migrated.hotkeys, v10.hotkeys);
  assert.deepEqual(migrateConfig(migrated), migrated, "idempotent");
});

test("v10 -> v11: an edited Alt+R action is kept", () => {
  const edited = legacyRename();
  edited.executionPolicy.timeoutMs = 4000;
  const migrated = migrateConfig(withRename(10, edited));
  assert.deepEqual(action(migrated, "action.renameVariable"), edited);
});

// --- lintConfig: hotkeys that cannot fire ---------------------------------------------------

test("lintConfig: shipped defaults have no warnings", () => {
  assert.deepEqual(lintConfig(createDefaultConfig()), []);
});

test("lintConfig: unknown action, disabled action, no modifier", () => {
  const config = createDefaultConfig();
  config.hotkeys.push({ key: "alt+y", actionId: "action.nope" });
  config.hotkeys.push({ key: "k", actionId: "action.save" });
  action(config, "action.academy").enabled = false;
  const warnings = lintConfig(config);
  const text = warnings.join("\n");
  assert.equal(warnings.length, 3, text);
  assert.match(text, /alt\+h: action "action\.academy" is disabled/);
  assert.match(text, /alt\+y: action "action\.nope" does not exist/);
  assert.match(text, /^k: needs Alt, Ctrl or Meta/m);
});

test("lintConfig: the same key twice warns only where hosts and paths overlap", () => {
  const config = createDefaultConfig();
  // alt+e is models-only; the same key on datasets pages does not clash.
  config.hotkeys.push({ key: "alt+e", actionId: "action.save", hosts: ["app.abacum.io"], paths: ["/app/datasets"] });
  assert.deepEqual(lintConfig(config), []);
  // On every page it clashes with the shipped models-only binding, which comes first.
  config.hotkeys.push({ key: "alt+e", actionId: "action.academy", hosts: ["app.abacum.io"] });
  const warnings = lintConfig(config);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /alt\+e: bound twice; where both apply, "action\.bulkDimensions" wins and "action\.academy" does not fire/);
});
