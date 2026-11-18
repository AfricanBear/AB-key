// The extension version is shown next to the title in the hotkey panel and on the Options page.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

for (const page of ["popup", "options"]) {
  test(`${page}: title has a version badge filled from manifest.json`, () => {
    assert.match(read(`src/${page}/${page}.html`), /<h1>A\+B key <span id="appVersion" class="app-version"><\/span><\/h1>/);
    const script = read(`src/${page}/${page}.js`);
    assert.match(script, /getElementById\("appVersion"\)/);
    assert.match(script, /textContent = `v\$\{chrome\.runtime\.getManifest\(\)\.version\}`/);
    assert.match(read(`src/${page}/${page}.css`), /\.app-version \{/);
  });
}
