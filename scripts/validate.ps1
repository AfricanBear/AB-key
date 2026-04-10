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

Write-Host "Manifest validation passed."
