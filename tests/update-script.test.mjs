// In-place updater (scripts/update.ps1): Chrome keeps an unpacked extension's storage only when it
// is updated in the same folder and reloaded, so zip installs need a way to do that.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("the release zip ships the updater", () => {
  assert.match(read("scripts/package.ps1"), /Copy-Item -Path \(Join-Path \$root "scripts\/update\.ps1"\)/);
});

test("the updater refuses a git checkout and a zip that is not AB-key, and replaces only its own folders", () => {
  const script = read("scripts/update.ps1");
  assert.match(script, /Test-Path \(Join-Path \$targetPath "\.git"\)/);
  assert.match(script, /\$next\.name -ne "AB-key"/);
  assert.match(script, /\$current\.name -ne "AB-key"/);
  assert.match(script, /foreach \(\$dir in @\("src", "assets"\)\)/);
  // Windows PowerShell 5.1 has no $PSScriptRoot in param defaults.
  assert.doesNotMatch(script, /param\([\s\S]*\$PSScriptRoot[\s\S]*?\)\s*\n\s*\$ErrorActionPreference/);
});

test("without -Zip the updater downloads a GitHub release and skips an up-to-date install", () => {
  const script = read("scripts/update.ps1");
  assert.match(script, /\[string\]\$Zip = ""/, "-Zip is optional");
  assert.match(script, /api\.github\.com\/repos\/\$Repo\/releases\/latest/);
  assert.match(script, /github\.com\/\$Repo\/archive\/refs\/tags\/\$tag\.zip/);
  assert.match(script, /-not \$Force -and \$wanted -le \$installed/);
  assert.match(script, /SecurityProtocolType\]::Tls12/, "Windows PowerShell 5.1 needs TLS 1.2 for GitHub");
});

test("README explains updating in place", () => {
  const readme = read("README.md");
  assert.match(readme, /## Update/);
  assert.match(readme, /## Get the files/);
  assert.match(readme, /-File scripts\\update\.ps1\r?\n/, "the one-line update without -Zip");
  assert.match(readme, /fatal: not a git repository/);
  assert.match(readme, /Do not \*\*Remove\*\* AB-key/);
});
