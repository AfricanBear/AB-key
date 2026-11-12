param(
  [string]$OutputDir = "dist",
  [string]$Target = "chrome"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$outputPath = Join-Path $root $OutputDir
$normalizedTarget = $Target.ToLowerInvariant()
$zipName = if ($normalizedTarget -eq "opera") { "AB-key-opera.zip" } else { "AB-key.zip" }
$zipPath = Join-Path $outputPath $zipName

if (-not (Test-Path $outputPath)) {
  New-Item -Path $outputPath -ItemType Directory | Out-Null
}

if (Test-Path $zipPath) {
  Remove-Item $zipPath -Force
}

$staging = Join-Path $outputPath "staging"
if (Test-Path $staging) {
  Remove-Item $staging -Recurse -Force
}
New-Item -Path $staging -ItemType Directory | Out-Null

Copy-Item -Path (Join-Path $root "manifest.json") -Destination $staging
Copy-Item -Path (Join-Path $root "src") -Destination $staging -Recurse
# Icons and option previews are referenced by the manifest and options page.
Copy-Item -Path (Join-Path $root "assets") -Destination $staging -Recurse
Copy-Item -Path (Join-Path $root "README.md") -Destination $staging

Compress-Archive -Path (Join-Path $staging "*") -DestinationPath $zipPath
Remove-Item $staging -Recurse -Force

Write-Host "Packaged extension at $zipPath"
