# -----------------------------------------------------------------------------
# build.ps1 — Build a single-file Windows executable with PyInstaller.
#
# Usage (from the windows-service folder):
#   powershell -ExecutionPolicy Bypass -File .\build.ps1
#
# Output: dist\WorkshopLabelService.exe  (no Python install required to run it)
# -----------------------------------------------------------------------------
[CmdletBinding()]
param(
    [switch]$Clean
)

$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

$AppName = "WorkshopLabelService"

Write-Host "== Workshop Label Service — build ==" -ForegroundColor Cyan

# 1) Ensure a virtual environment with dependencies.
$venv = Join-Path $PSScriptRoot ".venv"
if (-not (Test-Path $venv)) {
    Write-Host "Creating virtual environment..." -ForegroundColor Yellow
    python -m venv $venv
}
$py = Join-Path $venv "Scripts\python.exe"

Write-Host "Installing dependencies..." -ForegroundColor Yellow
& $py -m pip install --upgrade pip | Out-Null
& $py -m pip install -r requirements.txt

if ($Clean) {
    Write-Host "Cleaning previous build output..." -ForegroundColor Yellow
    Remove-Item -Recurse -Force build, dist -ErrorAction SilentlyContinue
    Remove-Item -Force "$AppName.spec" -ErrorAction SilentlyContinue
}

# 2) Build. Bundle templates, static assets and the example config.
#    On Windows the --add-data separator is ';'.
Write-Host "Running PyInstaller..." -ForegroundColor Yellow
& $py -m PyInstaller `
    --noconfirm `
    --onefile `
    --name $AppName `
    --add-data "templates;templates" `
    --add-data "static;static" `
    --add-data "config.example.toml;." `
    --hidden-import "win32timezone" `
    --collect-submodules "uvicorn" `
    run.py

if (Test-Path (Join-Path $PSScriptRoot "dist\$AppName.exe")) {
    Write-Host ""
    Write-Host "Build complete: dist\$AppName.exe" -ForegroundColor Green
    Write-Host "Run it, then open http://127.0.0.1:8765" -ForegroundColor Green
} else {
    Write-Error "Build failed — dist\$AppName.exe not found."
}
