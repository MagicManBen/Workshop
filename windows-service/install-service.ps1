# -----------------------------------------------------------------------------
# install-service.ps1 — Auto-start the Workshop Label Service at logon using
# Windows Task Scheduler (the default, no extra software required).
#
# Usage (from the windows-service folder, after building the exe):
#   powershell -ExecutionPolicy Bypass -File .\install-service.ps1
#
# To remove:
#   powershell -ExecutionPolicy Bypass -File .\install-service.ps1 -Uninstall
#
# Alternative: run as a true Windows Service with NSSM (see README.md).
# -----------------------------------------------------------------------------
[CmdletBinding()]
param(
    [string]$ExePath,
    [string]$TaskName = "WorkshopLabelService",
    [switch]$Uninstall
)

$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

if ($Uninstall) {
    if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
        Write-Host "Removed scheduled task '$TaskName'." -ForegroundColor Green
    } else {
        Write-Host "No scheduled task named '$TaskName' found." -ForegroundColor Yellow
    }
    return
}

if (-not $ExePath) {
    $ExePath = Join-Path $PSScriptRoot "dist\WorkshopLabelService.exe"
}
if (-not (Test-Path $ExePath)) {
    Write-Error "Executable not found at '$ExePath'. Build it first with build.ps1 (or pass -ExePath)."
}
$ExePath = (Resolve-Path $ExePath).Path
$workDir = Split-Path $ExePath -Parent

Write-Host "Registering logon auto-start task '$TaskName'..." -ForegroundColor Cyan
Write-Host "  Executable: $ExePath"

$action   = New-ScheduledTaskAction -Execute $ExePath -WorkingDirectory $workDir
$trigger  = New-ScheduledTaskTrigger -AtLogOn
# Run in the current user's context; no highest-privileges needed for printing.
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit ([TimeSpan]::Zero)

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
    -Principal $principal -Settings $settings -Force | Out-Null

Write-Host "Done. The service will start automatically at logon." -ForegroundColor Green
Write-Host "Start it now with:  Start-ScheduledTask -TaskName $TaskName" -ForegroundColor Green
Write-Host "Then open:          http://127.0.0.1:8765" -ForegroundColor Green
