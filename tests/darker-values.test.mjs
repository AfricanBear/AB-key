import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createDefaultConfig, migrateConfig } from "../src/shared/config-schema.js";
import { CONFIG_KEY, loadV1Config, sleep } from "./helpers.mjs";

const SCRIPT = fs.readFileSync(new URL("../src/content/abacum-darker-values.js", import.meta.url), "utf8");
const STYLE_ID = "ab-key-darker-model-values";

async function load(config) {
  const nodes = new Map();
  let onChanged = null;
  const head = {
    appendChild(node) {
      nodes.set(node.id, node);
      node.remove = () => nodes.delete(node.id);
    }
  };
  const ctx = {
    Promise,
    chrome: {
      storage: {
        local: { get: async () => ({ [CONFIG_KEY]: config }) },
        onChanged: { addListener: (fn) => (onChanged = fn) }
      }
    },
    document: {
      head,
      documentElement: head,
      getElementById: (id) => nodes.get(id) || null,
      createElement: () => ({ id: "", textContent: "" })
    }
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(SCRIPT, ctx, { filename: "abacum-darker-values.js" });
  await sleep(10);
  return {
    style: () => nodes.get(STYLE_ID) || null,
    change: (newValue) => onChanged({ [CONFIG_KEY]: { newValue } }, "local")
  };
}

test("darker values are on by default, including for migrated configs", () => {
  assert.equal(createDefaultConfig().darkerModelValuesEnabled, true);
  assert.equal(migrateConfig(loadV1Config()).darkerModelValuesEnabled, true);
  const off = migrateConfig({ ...createDefaultConfig(), darkerModelValuesEnabled: false });
  assert.equal(off.darkerModelValuesEnabled, false, "user choice is kept");
});

test("enabled: injects one style for value cells, anchored on data-testid", async () => {
  const page = await load(createDefaultConfig());
  assert.ok(page.style());
  assert.match(page.style().textContent, /\[data-testid="value-cell"\]/);
  assert.match(page.style().textContent, /rgb\(23, 23, 23\) !important/);
  assert.doesNotMatch(page.style().textContent, /css-[a-z0-9]{5,}/, "no hashed Abacum classes");
});

test("disabled: no style; toggling in options applies without reload", async () => {
  const page = await load({ ...createDefaultConfig(), darkerModelValuesEnabled: false });
  assert.equal(page.style(), null);
  page.change({ ...createDefaultConfig(), darkerModelValuesEnabled: true });
  assert.ok(page.style(), "turned on");
  page.change({ ...createDefaultConfig(), darkerModelValuesEnabled: false });
  assert.equal(page.style(), null, "turned off");
});

test("a config without the setting (not migrated yet) counts as enabled", async () => {
  const page = await load(loadV1Config());
  assert.ok(page.style());
});
