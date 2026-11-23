import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createDefaultConfig, migrateConfig } from "../src/shared/config-schema.js";
import { CONFIG_KEY, loadV1Config, sleep } from "./helpers.mjs";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const MAIN_PATH = "src/content/abacum-model-save-fix-main.js";
const ISOLATED_PATH = "src/content/abacum-model-save-fix.js";
const readIfExists = (path) => (fs.existsSync(new URL(`../${path}`, import.meta.url)) ? read(path) : "");
const MAIN_SCRIPT = readIfExists(MAIN_PATH);
const ISOLATED_SCRIPT = readIfExists(ISOLATED_PATH);
const manifest = JSON.parse(read("manifest.json"));
const ATTR = "data-ab-key-save-fix";

const MODEL_ID = "11111111-2222-4333-8444-555555555555";
const SAVE_URL = `https://api.example.test/modelling/${MODEL_ID}`;

/** Save body as Abacum sends it (trimmed to the fields that matter). */
function saveBody({ deleted = [], created = [] } = {}) {
  return JSON.stringify({
    code: "TEST_MODEL",
    id: MODEL_ID,
    lines: [{ name: "New one", code: "T_MD_O0NF" }],
    is_locked: false,
    variables_created: created,
    variables_edited: [],
    variables_deleted: deleted,
    variables_duplicated: []
  });
}

function fakeHtml() {
  const attrs = {};
  return {
    getAttribute: (name) => (name in attrs ? attrs[name] : null),
    setAttribute: (name, value) => (attrs[name] = String(value)),
    removeAttribute: (name) => delete attrs[name]
  };
}

/** Runs the page-world script with a fake XMLHttpRequest that records what was really sent. */
function loadMain({ enabled = true } = {}) {
  const html = fakeHtml();
  if (enabled) html.setAttribute(ATTR, "on");
  const sent = [];
  class FakeXHR {
    open(method, url) {
      this.method = method;
      this.url = url;
    }
    send(body) {
      sent.push({ method: this.method, url: this.url, body });
    }
  }
  const ctx = { document: { documentElement: html }, XMLHttpRequest: FakeXHR, JSON, console: { warn() {} } };
  ctx.globalThis = ctx;
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(MAIN_SCRIPT, ctx, { filename: "abacum-model-save-fix-main.js" });
  return {
    html,
    main: ctx.AbKeyModelSaveFixMain,
    /** Sends a request through the (patched) XHR; returns the body that went out. */
    request(method, url, body) {
      const xhr = new ctx.XMLHttpRequest();
      xhr.open(method, url, true);
      xhr.send(body);
      return sent.at(-1).body;
    }
  };
}

const deletedOf = (body) => JSON.parse(body).variables_deleted;

test("Save no longer sends the temporary key of a variable deleted before it was ever saved", () => {
  const page = loadMain();
  const out = page.request("PUT", SAVE_URL, saveBody({ deleted: ["0eqLj9i5oc-valid"], created: ["T_MD_O0NF"] }));
  assert.deepEqual(deletedOf(out), []);
  const parsed = JSON.parse(out);
  assert.deepEqual(parsed.variables_created, ["T_MD_O0NF"], "the rest of the save is kept");
  assert.equal(parsed.lines[0].name, "New one");
});

test("a real variable marked for deletion is still deleted (sent by its code)", () => {
  const page = loadMain();
  const body = saveBody({ deleted: ["T_MD_CBIL"] });
  assert.equal(page.request("PUT", SAVE_URL, body), body, "body is not even re-serialized");
});

test("mixed list: only temporary keys are dropped, real ids keep their order", () => {
  const page = loadMain();
  const out = page.request(
    "PUT",
    SAVE_URL,
    saveBody({ deleted: ["T_MD_AAAA", "81rzYX8LwF-valid", "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", "xo99D2eAqb-valid"] })
  );
  assert.deepEqual(deletedOf(out), ["T_MD_AAAA", "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"]);
});

test("only the model save request is touched", () => {
  const page = loadMain();
  const body = saveBody({ deleted: ["0eqLj9i5oc-valid"] });
  assert.equal(page.request("POST", SAVE_URL, body), body, "other method");
  assert.equal(page.request("put", "https://api.example.test/modelling", body), body, "no model id");
  assert.equal(page.request("PUT", `https://api.example.test/modelling/${MODEL_ID}/lines`, body), body, "sub-resource");
  assert.equal(page.request("PUT", "https://api.example.test/variables/code/generate", body), body, "other endpoint");
  assert.equal(page.request("PUT", SAVE_URL, "not json {"), "not json {", "not JSON");
  assert.equal(page.request("PUT", SAVE_URL, null), null, "no body");
  const noList = JSON.stringify({ id: MODEL_ID, lines: [] });
  assert.equal(page.request("PUT", SAVE_URL, noList), noList, "no variables_deleted");
  assert.deepEqual(deletedOf(page.request("put", `/modelling/${MODEL_ID}?x=1`, body)), [], "relative URL, query");
});

test("temporary key pattern is narrow", () => {
  const { isTemporaryKey } = loadMain().main;
  for (const key of ["0eqLj9i5oc-valid", "81rzYX8LwF-valid", "xo99D2eAqb-valid"]) assert.equal(isTemporaryKey(key), true, key);
  for (const key of ["T_MD_CBIL", "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", "valid", "-valid", "abc-valid-x", "a b-valid", 42, null]) {
    assert.equal(isTemporaryKey(key), false, String(key));
  }
});

test("turned off: requests go out unchanged, and turning on applies without reload", () => {
  const page = loadMain({ enabled: false });
  const body = saveBody({ deleted: ["0eqLj9i5oc-valid"] });
  assert.equal(page.request("PUT", SAVE_URL, body), body);
  page.html.setAttribute(ATTR, "on");
  assert.deepEqual(deletedOf(page.request("PUT", SAVE_URL, body)), []);
});

test("setting: on by default, kept when the user turns it off, added to old configs", () => {
  assert.equal(createDefaultConfig().unsavedVariableDeleteFixEnabled, true);
  assert.equal(migrateConfig(loadV1Config()).unsavedVariableDeleteFixEnabled, true);
  const off = migrateConfig({ ...createDefaultConfig(), unsavedVariableDeleteFixEnabled: false });
  assert.equal(off.unsavedVariableDeleteFixEnabled, false);
});

async function loadIsolated(config) {
  const html = fakeHtml();
  let onChanged = null;
  const ctx = {
    Promise,
    chrome: {
      storage: {
        local: { get: async () => ({ [CONFIG_KEY]: config }) },
        onChanged: { addListener: (fn) => (onChanged = fn) }
      }
    },
    document: { documentElement: html }
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(ISOLATED_SCRIPT, ctx, { filename: "abacum-model-save-fix.js" });
  await sleep(10);
  return {
    value: () => html.getAttribute(ATTR),
    change: (newValue) => onChanged({ [CONFIG_KEY]: { newValue } }, "local")
  };
}

test("settings script mirrors the option into the <html> attribute and follows changes", async () => {
  const page = await loadIsolated(createDefaultConfig());
  assert.equal(page.value(), "on");
  page.change({ ...createDefaultConfig(), unsavedVariableDeleteFixEnabled: false });
  assert.equal(page.value(), null);
  page.change({ ...createDefaultConfig(), unsavedVariableDeleteFixEnabled: true });
  assert.equal(page.value(), "on");
  assert.equal((await loadIsolated(loadV1Config())).value(), "on", "not migrated yet counts as on");
});

test("manifest: page-world part in MAIN without chrome.*, settings part isolated, Abacum only", () => {
  const main = manifest.content_scripts.find((item) => item.js.includes(MAIN_PATH));
  assert.ok(main, "page-world script is in the manifest");
  assert.equal(main.world, "MAIN");
  assert.deepEqual(main.matches, ["*://*.abacum.io/*"]);
  assert.doesNotMatch(MAIN_SCRIPT.replace(/^\s*\/\/.*$/gm, ""), /chrome\./);
  const isolated = manifest.content_scripts.find((item) => item.js.includes(ISOLATED_PATH));
  assert.ok(isolated, "settings script is in the manifest");
  assert.equal(isolated.world, undefined);
  assert.deepEqual(isolated.matches, ["*://*.abacum.io/*"]);
});

test("options page has the toggle and saves it", () => {
  assert.match(read("src/options/options.html"), /id="unsavedVariableDeleteFixEnabled"/);
  // Toggle id = config flag; the generic wiring is tested in options-groups / options-ux.
});
