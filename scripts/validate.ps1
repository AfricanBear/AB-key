$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$manifestPath = Join-Path $root "manifest.json"

if (-not (Test-Path $manifestPath)) {
  throw "manifest.json not found"
}

$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
$required = @("manifest_version", "name", "version", "background", "content_scripts")
foreach ($key in $required) {
  if (-not $manifest.$key) {
    throw "manifest.json is missing required field: $key"
  }
}

# Every file referenced by the manifest must exist.
$referenced = @($manifest.background.service_worker, $manifest.options_page)
foreach ($entry in $manifest.content_scripts) {
  $referenced += $entry.js
  if ($entry.css) { $referenced += $entry.css }
  # Chrome ignores "type": "module" on content scripts; they always run as classic scripts.
  if ($entry.PSObject.Properties.Name -contains "type") {
    throw "content_scripts entry must not declare 'type' (ES-module content scripts are not supported)."
  }
}
$referenced += $manifest.icons.PSObject.Properties.Value
$referenced += $manifest.web_accessible_resources | ForEach-Object { $_.resources }
foreach ($file in ($referenced | Where-Object { $_ } | Sort-Object -Unique)) {
  if (-not (Test-Path (Join-Path $root $file))) {
    throw "manifest.json references a missing file: $file"
  }
}

# Content scripts are classic scripts: a static import/export is a SyntaxError at load time.
foreach ($entry in $manifest.content_scripts) {
  foreach ($file in $entry.js) {
    $source = Get-Content (Join-Path $root $file) -Raw
    if ($source -match '(?m)^\s*(import\s+[\w{*]|export\s)') {
      throw "Content script uses ES module syntax: $file"
    }
  }
}

Write-Host "Manifest validation passed."
