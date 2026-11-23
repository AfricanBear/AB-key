import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { diffForm } from "../src/options/dirty-state.js";
import { flagsFromText, parseConfigText, setFlagInText } from "../src/options/config-form.js";
import { createDefaultConfig } from "../src/shared/config-schema.js";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// --- Version tag → GitHub Releases -----------------------------------------

for (const page of ["options", "popup"]) {
  test(`${page}: the version tag opens GitHub Releases in a new tab`, () => {
    const html = read(`src/${page}/${page}.html`);
    const tag = html.match(/<a\b[^>]*id="appVersion"[^>]*>/);
    assert.ok(tag, "appVersion is an <a>");
    assert.match(tag[0], /href="https:\/\/github\.com\/AfricanBear\/AB-key\/releases"/);
    assert.match(tag[0], /target="_blank"/);
    assert.match(tag[0], /rel="noopener noreferrer"/);
    assert.match(read(`src/${page}/${page}.css`), /a\.app-version:hover/);
  });
}

// --- Sticky header ------------------------------------------------------------

test("Options: the header with Save stays on top while scrolling", () => {
  const css = read("src/options/options.css");
  const header = css.match(/\.page-header \{[^}]*\}/);
  assert.ok(header, ".page-header rule");
  assert.match(header[0], /position: sticky;/);
  assert.match(header[0], /top: 0;/);
  assert.match(header[0], /z-index: \d+;/);
  assert.match(header[0], /background: /, "opaque, so cards do not show through");
  assert.match(read("src/options/options.html"), /<header class="page-header">[\s\S]*?id="saveBtn"[\s\S]*?<\/header>/);
});

// --- Unsaved changes --------------------------------------------------------

const BASE = { toggles: { a: true, b: false, c: true }, json: '{\n  "x": 1\n}' };

test("diffForm: no changes", () => {
  assert.deepEqual(diffForm(BASE, structuredClone(BASE)), { toggles: [], json: false, count: 0 });
});

test("diffForm: changed toggles are listed; toggling back clears them", () => {
  const current = structuredClone(BASE);
  current.toggles.a = false;
  current.toggles.b = true;
  assert.deepEqual(diffForm(BASE, current), { toggles: ["a", "b"], json: false, count: 2 });
  current.toggles.a = true;
  current.toggles.b = false;
  assert.equal(diffForm(BASE, current).count, 0);
});

test("diffForm: JSON compares by content, not by whitespace", () => {
  assert.equal(diffForm(BASE, { ...BASE, json: '{"x":1}' }).json, false);
  assert.deepEqual(diffForm(BASE, { ...BASE, json: '{"x":2}' }), { toggles: [], json: true, count: 1 });
});

test("diffForm: invalid JSON being typed counts as a change", () => {
  assert.equal(diffForm(BASE, { ...BASE, json: '{"x":' }).json, true);
  assert.equal(diffForm(BASE, { ...BASE, json: BASE.json + " " }).json, false);
});

test("diffForm: no baseline yet (config not loaded) means no changes", () => {
  assert.equal(diffForm(null, BASE).count, 0);
});

test("Options wires dirty highlighting to rows, the JSON field and Save", () => {
  const js = read("src/options/options.js");
  assert.match(js, /from "\.\/dirty-state\.js"/);
  assert.match(js, /classList\.toggle\("is-dirty"/);
  assert.match(js, /saveBtn\.classList\.toggle\("has-changes"/);
  // The baseline is reset after load and after a successful save.
  assert.equal((js.match(/takeBaseline\(\)/g) || []).length >= 3, true, "defined + called on load and save");

  // Leaving the page with unsaved changes asks the browser's "Leave site?" question.
  assert.match(
    js,
    /addEventListener\("beforeunload", \(event\) => \{\s*if \(diffForm\(baseline, readForm\(\)\)\.count\) event\.preventDefault\(\);\s*\}\)/
  );

  const css = read("src/options/options.css");
  assert.match(css, /\.toggle-row\.is-dirty \{/);
  assert.match(css, /textarea\.is-dirty[ ,]/);
  assert.match(css, /\.btn-primary\.has-changes \{/);
});

// --- JSON is the source of truth; toggles show its flags ----------------------------------

const FLAGS = ["diagnosticsEnabled", "lightThemeNavEnabled", "datasetPinColumnsEnabled"];
const defaultsText = () => JSON.stringify(createDefaultConfig(), null, 2);

test("flagsFromText reads flags from JSON (missing ones get defaults)", () => {
  const config = createDefaultConfig();
  config.diagnosticsEnabled = true;
  config.datasetPinColumnsEnabled = false;
  delete config.lightThemeNavEnabled;
  assert.deepEqual(flagsFromText(JSON.stringify(config), FLAGS), {
    diagnosticsEnabled: true,
    lightThemeNavEnabled: false,
    datasetPinColumnsEnabled: false
  });
});

test("flagsFromText: half-typed JSON or a non-config gives null", () => {
  assert.equal(flagsFromText('{"actions": [', FLAGS), null);
  assert.equal(flagsFromText("[1, 2]", FLAGS), null);
  assert.equal(flagsFromText('{"configVersion": 10, "actions": 5}', FLAGS), null);
  assert.equal(parseConfigText("null"), null);
});

test("setFlagInText changes only that flag; null for broken JSON", () => {
  const next = setFlagInText(defaultsText(), "diagnosticsEnabled", true);
  const expected = createDefaultConfig();
  expected.diagnosticsEnabled = true;
  assert.deepEqual(JSON.parse(next), expected);
  assert.equal(setFlagInText("{", "diagnosticsEnabled", true), null);
});

test("Save stores the JSON as is: toggles no longer overwrite imported or typed flags", () => {
  const js = read("src/options/options.js");
  const save = js.match(/async function saveConfig\(\) \{[\s\S]*?\n\}/)[0];
  assert.doesNotMatch(save, /\.checked/, "Save does not read the checkboxes");
  assert.doesNotMatch(save, /parsed\.\w+Enabled =/);
  assert.match(save, /migrateConfig\(JSON\.parse\(configText\.value\)\)/);
  assert.match(save, /lintConfig\(migrated\)/);
  // Import and typing show the file's flags on the toggles; a toggle writes its flag into the JSON.
  const imp = js.match(/function importConfig\(\) \{[\s\S]*?\n\}/)[0];
  assert.match(imp, /showFlags\(text\)/);
  assert.match(js, /configText\.addEventListener\("input", \(\) => \{\s*showFlags\(configText\.value\)/);
  assert.match(js, /setFlagInText\(configText\.value, input\.id, input\.checked\)/);
});

test("diffForm: a toggle that also edits its flag in the JSON is one change, not two", () => {
  const base = { toggles: { diagnosticsEnabled: false }, json: defaultsText() };
  const current = { toggles: { diagnosticsEnabled: true }, json: setFlagInText(base.json, "diagnosticsEnabled", true) };
  assert.deepEqual(diffForm(base, current), { toggles: ["diagnosticsEnabled"], json: false, count: 1 });
  const hotkeyEdit = JSON.parse(current.json);
  hotkeyEdit.hotkeys[0].key = "alt+9";
  assert.equal(diffForm(base, { ...current, json: JSON.stringify(hotkeyEdit) }).count, 2);
});

test("Options explains the Verbose console level and the hotkey format", () => {
  const html = read("src/options/options.html");
  assert.match(html, /<b>Verbose<\/b>/);
  assert.match(html, /<code>alt\+shift\+1<\/code>/);
  assert.match(read("src/options/options.css"), /\.status\.is-warn \{/);
});

// --- No browser command left -------------------------------------------------------------

test("manifest has no browser command; nothing sends EXECUTE_ACTION or stores logs", () => {
  const manifest = JSON.parse(read("manifest.json"));
  assert.equal(manifest.commands, undefined);
  assert.equal(fs.existsSync(new URL("../src/background/hotkey-orchestrator.js", import.meta.url)), false);
  for (const file of ["src/background/service-worker.js", "src/content/content-script.js", "src/shared/logger.js"]) {
    assert.doesNotMatch(read(file), /EXECUTE_ACTION|chrome\.commands|appendLog/, file);
  }
  assert.match(read("src/background/service-worker.js"), /chrome\.storage\.local\.remove\(LEGACY_LOG_KEY\)/);
});
