import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createDefaultConfig } from "../src/shared/config-schema.js";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const html = read("src/options/options.html");
const optionsJs = read("src/options/options.js");

const EXPECTED_GROUPS = {
  Appearance: ["abacumTabTitleEnabled", "lightThemeNavEnabled", "darkerModelValuesEnabled"],
  Models: ["formulaWordDeleteEnabled", "modelDimensionsEnabled", "unsavedVariableDeleteFixEnabled"],
  Datasets: [
    "datasetSelectionSumEnabled",
    "datasetPinColumnsEnabled",
    "datasetTwoRowHeaderEnabled",
    "datasetTransformLinkEnabled"
  ],
  Advanced: ["diagnosticsEnabled"]
};

const checkboxIds = (fragment) => [...fragment.matchAll(/<input type="checkbox" id="([^"]+)"/g)].map((m) => m[1]);

function featureGroups() {
  return [...html.matchAll(/<fieldset class="feature-group">([\s\S]*?)<\/fieldset>/g)].map((m) => {
    const legend = m[1].match(/<legend class="feature-group-title">([^<]+)<\/legend>/);
    return { title: legend ? legend[1].trim() : null, ids: checkboxIds(m[1]) };
  });
}

test("Options groups the feature toggles by topic, in order", () => {
  const groups = featureGroups();
  assert.deepEqual(
    groups.map((g) => g.title),
    Object.keys(EXPECTED_GROUPS)
  );
  for (const group of groups) {
    assert.deepEqual(group.ids, EXPECTED_GROUPS[group.title], `toggles in ${group.title}`);
  }
});

test("Every feature toggle sits in exactly one group and none is lost", () => {
  const grouped = featureGroups().flatMap((g) => g.ids);
  const all = checkboxIds(html);
  assert.deepEqual([...grouped].sort(), [...all].sort());
  assert.equal(new Set(grouped).size, grouped.length);

  // A toggle's id is the config flag it shows, so each must be a boolean in the defaults.
  const defaults = createDefaultConfig();
  for (const id of all) assert.equal(typeof defaults[id], "boolean", `${id} is a config flag`);
  assert.match(optionsJs, /\.feature-group input\[type="checkbox"\]/);
});

test("Group titles are styled", () => {
  const css = read("src/options/options.css");
  assert.match(css, /\.feature-group \{/);
  assert.match(css, /\.feature-group-title \{/);
});
