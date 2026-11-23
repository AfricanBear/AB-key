import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { spawnSync } from "node:child_process";

// Many tests only read source text, so a file that does not even parse could still pass them.
// ES modules: options, popup, background, shared. Content scripts are classic scripts.
const MODULE_DIRS = ["src/options", "src/popup", "src/background", "src/shared"];
const CLASSIC_DIRS = ["src/content"];

const jsFiles = (dir) =>
  fs
    .readdirSync(new URL(`../${dir}`, import.meta.url))
    .filter((name) => name.endsWith(".js"))
    .map((name) => `${dir}/${name}`);

function check(file, type) {
  const source = fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
  return spawnSync(process.execPath, ["--check", `--input-type=${type}`], { input: source, encoding: "utf8" });
}

for (const dir of MODULE_DIRS) {
  for (const file of jsFiles(dir)) {
    test(`${file} parses as an ES module`, () => {
      const result = check(file, "module");
      assert.equal(result.status, 0, result.stderr);
    });
  }
}

for (const dir of CLASSIC_DIRS) {
  for (const file of jsFiles(dir)) {
    test(`${file} parses as a classic script`, () => {
      const result = check(file, "commonjs");
      assert.equal(result.status, 0, result.stderr);
    });
  }
}
