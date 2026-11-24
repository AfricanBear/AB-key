<#
.SYNOPSIS
  Updates an unpacked AB-key install in place, so the browser keeps its settings.

.DESCRIPTION
  The browser derives the ID of an unpacked extension from its folder path. Loading a new version
  from another folder (or removing and loading again) installs a new extension with empty
  storage: hotkeys, feature toggles, the guide state ("Only new features", shown tips) and pinned
  columns are lost. Updating the files in the same folder and clicking Reload keeps all of them.

  Without -Zip the script downloads the latest GitHub release of AB-key (or the one given with
  -Version) and does nothing when the install is already that version or newer. With -Zip it
  uses that file.

  It unpacks the zip into a temporary folder, checks that it is AB-key, replaces manifest.json,
  src/ and assets/ in the install folder and copies README.md and scripts/update.ps1. Nothing
  else in the folder is touched. A git checkout is refused: use `git pull` there.

.PARAMETER Zip
  A release zip: "Source code (zip)" of a GitHub release, or AB-key.zip / AB-key-opera.zip built
  by scripts/package.ps1. Optional: without it the release is downloaded.

.PARAMETER Version
  The release to download, e.g. 1.8.2 or v1.8.2. Default: the latest release.

.PARAMETER Target
  The folder the browser loads the extension from (the one with manifest.json).
  Default: the folder this script is in, one level up.

.PARAMETER Force
  Install the downloaded release even if the install is already that version or newer.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\update.ps1

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\update.ps1 -Zip "$HOME\Downloads\AB-key-1.8.2.zip"
#>
param(
  [string]$Zip = "",
  [string]$Version = "",
  [string]$Target = "",
  [switch]$Force
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue" # Invoke-WebRequest is many times slower with the progress bar
$Repo = "AfricanBear/AB-key"
# Windows PowerShell 5.1 leaves $PSScriptRoot empty in param defaults, so resolve it here.
if (-not $Target) { $Target = Split-Path -Parent $PSScriptRoot }

function Read-Manifest([string]$Folder) {
  $path = Join-Path $Folder "manifest.json"
  if (-not (Test-Path $path)) { return $null }
  return Get-Content -Raw -Encoding UTF8 $path | ConvertFrom-Json
}

function ConvertTo-Version([string]$Text) {
  $clean = $Text.Trim().TrimStart("v", "V")
  $parsed = $null
  if ([version]::TryParse($clean, [ref]$parsed)) { return $parsed }
  throw "'$Text' is not a version like 1.8.2."
}

$targetPath = (Resolve-Path $Target).Path
if (Test-Path (Join-Path $targetPath ".git")) {
  throw "$targetPath is a git checkout. Update it with 'git pull' instead, then click Reload in chrome://extensions."
}
$current = Read-Manifest $targetPath
if (-not $current -or $current.name -ne "AB-key") {
  throw "$targetPath does not contain an AB-key manifest.json. Pass -Target with the folder the browser loads AB-key from."
}

$temp = Join-Path ([System.IO.Path]::GetTempPath()) ("ab-key-update-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $temp | Out-Null
try {
  if ($Zip) {
    $zipPath = (Resolve-Path $Zip).Path
  } else {
    # GitHub needs TLS 1.2; Windows PowerShell 5.1 may not offer it by default.
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
    if ($Version) {
      $tag = "v" + (ConvertTo-Version $Version).ToString()
    } else {
      Write-Host "Looking up the latest AB-key release..."
      $tag = (Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases/latest" -UseBasicParsing).tag_name
      if (-not $tag) { throw "Could not read the latest release of $Repo from GitHub." }
    }
    $wanted = ConvertTo-Version $tag
    $installed = ConvertTo-Version $current.version
    if (-not $Force -and $wanted -le $installed) {
      Write-Host "AB-key v$($current.version) in $targetPath is up to date (release $tag). Nothing to do."
      return
    }
    $zipPath = Join-Path $temp "AB-key-$tag.zip"
    Write-Host "Downloading AB-key $tag..."
    Invoke-WebRequest -Uri "https://github.com/$Repo/archive/refs/tags/$tag.zip" -OutFile $zipPath -UseBasicParsing
  }

  $unpacked = Join-Path $temp "unpacked"
  Expand-Archive -Path $zipPath -DestinationPath $unpacked
  # A zip may hold the files at its root or inside one folder (GitHub's "Source code (zip)").
  $source = $unpacked
  if (-not (Test-Path (Join-Path $source "manifest.json"))) {
    $inner = @(Get-ChildItem -Path $unpacked -Directory)
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

  Write-Host "AB-key updated in $targetPath : v$($current.version) -> v$($next.version)"
  Write-Host "Now open chrome://extensions (or opera://extensions), click Reload on the AB-key card and refresh open Abacum tabs."
  Write-Host "Do not use Remove or Load unpacked: that starts from default settings."
} finally {
  Remove-Item -Recurse -Force $temp -ErrorAction SilentlyContinue
}
