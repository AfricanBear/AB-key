<#
.SYNOPSIS
  Updates an unpacked AB-key install in place from a release zip, so Chrome keeps its settings.

.DESCRIPTION
  Chrome derives the ID of an unpacked extension from its folder path. Loading a new version from
  another folder (or removing and loading again) installs a new extension with empty storage:
  hotkeys, feature toggles, the guide state ("Only new features", shown tips) and pinned columns
  are lost. Updating the files in the same folder and clicking Reload keeps all of them.

  This script unpacks the zip into a temporary folder, checks that it is AB-key, replaces
  manifest.json, src/ and assets/ in the install folder and copies README.md and
  scripts/update.ps1. Nothing else in the folder is touched. A git checkout is refused: use `git pull` there.

.PARAMETER Zip
  The release zip (AB-key.zip or AB-key-opera.zip, as built by scripts/package.ps1).

.PARAMETER Target
  The folder Chrome loads the extension from (the one with manifest.json).
  Default: the folder this script is in, one level up.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\update.ps1 -Zip "$HOME\Downloads\AB-key.zip"
#>
param(
  [Parameter(Mandatory = $true)][string]$Zip,
  [string]$Target = ""
)

$ErrorActionPreference = "Stop"
# Windows PowerShell 5.1 leaves $PSScriptRoot empty in param defaults, so resolve it here.
if (-not $Target) { $Target = Split-Path -Parent $PSScriptRoot }

function Read-Manifest([string]$Folder) {
  $path = Join-Path $Folder "manifest.json"
  if (-not (Test-Path $path)) { return $null }
  return Get-Content -Raw -Encoding UTF8 $path | ConvertFrom-Json
}

$zipPath = (Resolve-Path $Zip).Path
$targetPath = (Resolve-Path $Target).Path

if (Test-Path (Join-Path $targetPath ".git")) {
  throw "$targetPath is a git checkout. Update it with 'git pull' instead, then click Reload in chrome://extensions."
}
$current = Read-Manifest $targetPath
if (-not $current -or $current.name -ne "AB-key") {
  throw "$targetPath does not contain an AB-key manifest.json. Pass -Target with the folder Chrome loads AB-key from."
}

$temp = Join-Path ([System.IO.Path]::GetTempPath()) ("ab-key-update-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $temp | Out-Null
try {
  Expand-Archive -Path $zipPath -DestinationPath $temp
  # A zip may hold the files at its root or inside one folder.
  $source = $temp
  if (-not (Test-Path (Join-Path $source "manifest.json"))) {
    $inner = @(Get-ChildItem -Path $temp -Directory)
    if ($inner.Count -eq 1) { $source = $inner[0].FullName }
  }
  $next = Read-Manifest $source
  if (-not $next -or $next.name -ne "AB-key") { throw "$zipPath is not an AB-key release zip (no AB-key manifest.json)." }
  foreach ($dir in @("src", "assets")) {
    if (-not (Test-Path (Join-Path $source $dir))) { throw "$zipPath has no $dir folder." }
  }

  foreach ($dir in @("src", "assets")) {
    $old = Join-Path $targetPath $dir
    if (Test-Path $old) { Remove-Item -Recurse -Force $old }
    Copy-Item -Recurse -Path (Join-Path $source $dir) -Destination $old
  }
  Copy-Item -Force -Path (Join-Path $source "manifest.json") -Destination $targetPath
  if (Test-Path (Join-Path $source "README.md")) {
    Copy-Item -Force -Path (Join-Path $source "README.md") -Destination $targetPath
  }
  # The updater itself (PowerShell has already read this script, so replacing it is safe).
  $updater = Join-Path $source "scripts/update.ps1"
  if (Test-Path $updater) {
    New-Item -ItemType Directory -Force -Path (Join-Path $targetPath "scripts") | Out-Null
    Copy-Item -Force -Path $updater -Destination (Join-Path $targetPath "scripts")
  }
} finally {
  Remove-Item -Recurse -Force $temp -ErrorAction SilentlyContinue
}

Write-Host "AB-key updated in $targetPath : v$($current.version) -> v$($next.version)"
Write-Host "Now open chrome://extensions (or opera://extensions), click Reload on the AB-key card and refresh open Abacum tabs."
Write-Host "Do not use Remove or Load unpacked: that starts from default settings."
