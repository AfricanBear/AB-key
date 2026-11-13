import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CURRENT_CONFIG_VERSION,
  createDefaultConfig,
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

/** Stored config as an older version would have left it: migrate v1, then roll back the version. */
function storedAt(version, mutate = () => {}) {
  const config = migrateConfig(loadV1Config());
  config.configVersion = version;
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
  assert.equal(action(config, "action.primary").enabled, false, "submit-anywhere action is off");
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
  assert.equal(action(migrated, "action.primary").enabled, false);
  assert.equal(migrated.commandBindings.run_secondary_action, undefined);
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
  assert.equal(migrated.configVersion, 7);
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
