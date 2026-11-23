import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { diffForm } from "../src/options/dirty-state.js";

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
