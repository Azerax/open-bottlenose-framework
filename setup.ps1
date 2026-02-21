param(
  [string]$OpenClawHome = "$env:USERPROFILE\.openclaw"
)

$ErrorActionPreference = "Stop"

function Ensure-Dir($p) {
  if (-not (Test-Path $p)) { New-Item -ItemType Directory -Path $p | Out-Null }
}

Write-Host "OpenClaw setup starting..." -ForegroundColor Cyan
Ensure-Dir $OpenClawHome

$src = Join-Path (Get-Location).Path "config-templates"
if (-not (Test-Path $src)) { throw "Missing config-templates folder: $src" }

Get-ChildItem -Path $src -File -Filter "*.example" | ForEach-Object {
  $destName = $_.Name -replace "\.example$",""
  $destPath = Join-Path $OpenClawHome $destName

  if (Test-Path $destPath) {
    Write-Host "Exists, not overwriting: $destPath" -ForegroundColor Yellow
  } else {
    Copy-Item $_.FullName $destPath
    Write-Host "Created: $destPath" -ForegroundColor Green
  }
}

Write-Host ""
Write-Host "Next:" -ForegroundColor Cyan
Write-Host "1) Edit env files in $OpenClawHome"
Write-Host "2) Install deps for services as needed:"
Write-Host "   cd services\overlay-reader; npm i"
Write-Host "   cd services\overlay-writer; npm i"
Write-Host "3) Start services:"
Write-Host "   node services\overlay-reader\server.js"
Write-Host "   node services\overlay-writer\server.js"
