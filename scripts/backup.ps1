<#>
.SYNOPSIS
    House - Backup Script
    Creates a timestamped backup of the PocketBase database and uploaded files.

.DESCRIPTION
    This script:
    1. Creates a timestamped ZIP archive of pocketbase/pb_data
    2. Stores it in the backups folder
    3. Optionally keeps only the last N backups (default 30 days)

.NOTES
    Run this manually or schedule as a Windows Task for daily backups.
    Run from the house repository root.
#>

param(
    [string]$BackupDir = "backups",
    [string]$PbDataDir = "pocketbase/pb_data",
    [int]$KeepDays = 30,
    [switch]$Compress = $true
)

$ErrorActionPreference = "Stop"

Write-Host "=== House Backup ===" -ForegroundColor Cyan
Write-Host "Source: $PbDataDir" -ForegroundColor Gray
Write-Host "Destination: $BackupDir" -ForegroundColor Gray
Write-Host ""

# Check source exists
$sourcePath = Join-Path (Get-Location) $PbDataDir
if (-not (Test-Path $sourcePath)) {
    Write-Error "Source directory not found: $sourcePath"
    exit 1
}

# Create backup directory
$backupPath = Join-Path (Get-Location) $BackupDir
if (-not (Test-Path $backupPath)) {
    New-Item -ItemType Directory -Path $backupPath | Out-Null
    Write-Host "Created backup directory: $backupPath" -ForegroundColor Green
}

# Generate timestamp
$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$backupName = "house_backup_$timestamp"
$zipPath = Join-Path $backupPath "$backupName.zip"

Write-Host "Creating backup: $backupName" -ForegroundColor Yellow

# Get size before backup
$sourceSize = (Get-ChildItem $sourcePath -Recurse | Measure-Object -Property Length -Sum).Sum
$sourceSizeMB = [math]::Round($sourceSize / 1MB, 2)
Write-Host "Source size: $sourceSizeMB MB" -ForegroundColor Gray

# Create ZIP archive
if ($Compress) {
    Compress-Archive -Path (Join-Path $sourcePath "*") -DestinationPath $zipPath -Force
} else {
    # Just copy the folder
    $destPath = Join-Path $backupPath $backupName
    Copy-Item -Path $sourcePath -Destination $destPath -Recurse -Force
    $zipPath = $destPath
}

# Verify backup
if (Test-Path $zipPath) {
    $backupSize = (Get-Item $zipPath).Length
    $backupSizeMB = [math]::Round($backupSize / 1MB, 2)
    Write-Host "Backup created: $zipPath ($backupSizeMB MB)" -ForegroundColor Green
} else {
    Write-Error "Backup failed - file not found"
    exit 1
}

# Clean old backups
Write-Host "" -ForegroundColor Gray
Write-Host "Cleaning backups older than $KeepDays days..." -ForegroundColor Yellow

$cutoff = (Get-Date).AddDays(-$KeepDays)
$oldBackups = Get-ChildItem $backupPath -Filter "house_backup_*.zip" | Where-Object { $_.LastWriteTime -lt $cutoff }

if ($oldBackups.Count -gt 0) {
    foreach ($old in $oldBackups) {
        Write-Host "Removing: $($old.Name)" -ForegroundColor Gray
        Remove-Item $old.FullName -Force
    }
    Write-Host "Removed $($oldBackups.Count) old backup(s)" -ForegroundColor Green
} else {
    Write-Host "No old backups to remove" -ForegroundColor Gray
}

# List current backups
Write-Host "" -ForegroundColor Gray
Write-Host "Current backups:" -ForegroundColor Cyan
Get-ChildItem $backupPath -Filter "house_backup_*.zip" | Sort-Object LastWriteTime -Descending | ForEach-Object {
    $sizeMB = [math]::Round($_.Length / 1MB, 2)
    Write-Host "  $($_.Name) - $sizeMB MB - $($_.LastWriteTime)"
}

Write-Host "" -ForegroundColor Gray
Write-Host "=== Backup Complete ===" -ForegroundColor Cyan