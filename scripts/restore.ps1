<#>
.SYNOPSIS
    House - Restore Script
    Restores a backup of the PocketBase database and uploaded files.

.DESCRIPTION
    This script:
    1. Lists available backups
    2. Prompts for which backup to restore (or takes as parameter)
    3. Stops PocketBase if running
    4. Restores the backup to pocketbase/pb_data
    5. Optionally restarts PocketBase

.NOTES
    Run from the house repository root.
    WARNING: This will overwrite current data!
#>

param(
    [string]$BackupDir = "backups",
    [string]$PbDataDir = "pocketbase/pb_data",
    [string]$BackupFile = "",
    [switch]$Force,
    [switch]$RestartPb
)

$ErrorActionPreference = "Stop"

Write-Host "=== House Restore ===" -ForegroundColor Cyan
Write-Host "WARNING: This will OVERWRITE current data in $PbDataDir" -ForegroundColor Red
Write-Host ""

$backupPath = Join-Path (Get-Location) $BackupDir
if (-not (Test-Path $backupPath)) {
    Write-Error "Backup directory not found: $backupPath"
    exit 1
}

$backups = Get-ChildItem $backupPath -Filter "house_backup_*.zip" | Sort-Object LastWriteTime -Descending
if ($backups.Count -eq 0) {
    Write-Error "No backups found in $backupPath"
    exit 1
}

# If no backup specified, show menu
if (-not $BackupFile) {
    Write-Host "Available backups:" -ForegroundColor Yellow
    for ($i = 0; $i -lt $backups.Count; $i++) {
        $b = $backups[$i]
        $sizeMB = [math]::Round($b.Length / 1MB, 2)
        Write-Host "  [$i] $($b.Name) - $sizeMB MB - $($b.LastWriteTime)"
    }
    
    $choice = Read-Host "Enter backup number to restore (0-$($backups.Count - 1))"
    if ($choice -notmatch '^\d+$' -or [int]$choice -ge $backups.Count) {
        Write-Error "Invalid selection"
        exit 1
    }
    $BackupFile = $backups[[int]$choice].FullName
} else {
    $BackupFile = Join-Path $backupPath $BackupFile
    if (-not (Test-Path $BackupFile)) {
        Write-Error "Backup file not found: $BackupFile"
        exit 1
    }
}

$backupName = Split-Path $BackupFile -Leaf
Write-Host "Selected: $backupName" -ForegroundColor Yellow

# Confirm unless -Force
if (-not $Force) {
    $confirm = Read-Host "This will DELETE all current data and restore from backup. Type 'YES' to confirm"
    if ($confirm -ne 'YES') {
        Write-Host "Cancelled" -ForegroundColor Yellow
        exit 0
    }
}

# Stop PocketBase if running
$pbExe = Join-Path (Get-Location) "pocketbase\pocketbase.exe"
$pbProcess = Get-Process -Name "pocketbase" -ErrorAction SilentlyContinue
if ($pbProcess) {
    Write-Host "Stopping PocketBase..." -ForegroundColor Yellow
    Stop-Process -Name "pocketbase" -Force
    Start-Sleep -Seconds 2
}

# Backup current data first (safety)
$dataPath = Join-Path (Get-Location) $PbDataDir
if (Test-Path $dataPath) {
    $safetyBackup = "pb_data_safety_$(Get-Date -Format 'yyyy-MM-dd_HH-mm-ss')"
    $safetyPath = Join-Path (Get-Location) $safetyBackup
    Write-Host "Creating safety backup of current data..." -ForegroundColor Yellow
    Copy-Item -Path $dataPath -Destination $safetyPath -Recurse -Force
    Write-Host "Safety backup at: $safetyPath" -ForegroundColor Green
}

# Clear current data
Write-Host "Clearing current data..." -ForegroundColor Yellow
if (Test-Path $dataPath) {
    Remove-Item -Path (Join-Path $dataPath "*") -Recurse -Force -ErrorAction SilentlyContinue
} else {
    New-Item -ItemType Directory -Path $dataPath | Out-Null
}

# Extract backup
Write-Host "Extracting backup..." -ForegroundColor Yellow
Expand-Archive -Path $BackupFile -DestinationPath $dataPath -Force

# Verify
$restoredFiles = Get-ChildItem $dataPath -Recurse | Measure-Object | Select-Object -ExpandProperty Count
Write-Host "Restored $restoredFiles files/folders" -ForegroundColor Green

# Restart PocketBase if requested
if ($RestartPb -and (Test-Path $pbExe)) {
    Write-Host "Starting PocketBase..." -ForegroundColor Yellow
    Start-Process -FilePath $pbExe -ArgumentList "serve", "--http=0.0.0.0:8090" -NoNewWindow
    Write-Host "PocketBase started" -ForegroundColor Green
}

Write-Host "" -ForegroundColor Gray
Write-Host "=== Restore Complete ===" -ForegroundColor Cyan
Write-Host "Data restored from: $backupName" -ForegroundColor Gray
if ($RestartPb) {
    Write-Host "PocketBase is running at http://localhost:8090" -ForegroundColor Gray
}