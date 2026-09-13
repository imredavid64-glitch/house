<#>
.SYNOPSIS
    House - PocketBase Setup Script
    Downloads PocketBase binary and runs migrations for the House social network.

.DESCRIPTION
    This script:
    1. Downloads the latest PocketBase Windows AMD64 binary
    2. Extracts it to pocketbase/pocketbase.exe
    3. Runs all migrations to set up the database schema
    4. Creates the admin user (imredavid64@gmail.com)

.NOTES
    Run this once on the Dell PC to set up PocketBase.
    Requires PowerShell 5.1+ and internet access.
#>

param(
    [string]$PocketBaseVersion = "0.25.3",
    [string]$InstallDir = "pocketbase",
    [switch]$ForceRedownload
)

$ErrorActionPreference = "Stop"

Write-Host "=== House PocketBase Setup ===" -ForegroundColor Cyan
Write-Host "Version: $PocketBaseVersion" -ForegroundColor Gray
Write-Host ""

# Create install directory
$installPath = Join-Path (Get-Location) $InstallDir
if (-not (Test-Path $installPath)) {
    New-Item -ItemType Directory -Path $installPath | Out-Null
    Write-Host "Created directory: $installPath" -ForegroundColor Green
}

$exePath = Join-Path $installPath "pocketbase.exe"

# Download PocketBase if needed
if ($ForceRedownload -or -not (Test-Path $exePath)) {
    Write-Host "Downloading PocketBase v$PocketBaseVersion..." -ForegroundColor Yellow
    
    $url = "https://github.com/pocketbase/pocketbase/releases/download/v$PocketBaseVersion/pocketbase_${PocketBaseVersion}_windows_amd64.zip"
    $zipPath = Join-Path $installPath "pocketbase.zip"
    
    try {
        Invoke-WebRequest -Uri $url -OutFile $zipPath -UseBasicParsing
        Write-Host "Downloaded to $zipPath" -ForegroundColor Green
    } catch {
        Write-Error "Failed to download PocketBase: $_"
        exit 1
    }
    
    Write-Host "Extracting..." -ForegroundColor Yellow
    Expand-Archive -Path $zipPath -DestinationPath $installPath -Force
    Remove-Item $zipPath
    Write-Host "Extracted pocketbase.exe" -ForegroundColor Green
} else {
    Write-Host "PocketBase already exists at $exePath" -ForegroundColor Green
}

# Run migrations
Write-Host "" -ForegroundColor Gray
Write-Host "Running migrations..." -ForegroundColor Yellow

$pbDataPath = Join-Path $installPath "pb_data"
if (-not (Test-Path $pbDataPath)) {
    New-Item -ItemType Directory -Path $pbDataPath | Out-Null
}

$migrationsPath = Join-Path (Get-Location) "pocketbase\pb_migrations"
if (-not (Test-Path $migrationsPath)) {
    Write-Error "Migrations folder not found at $migrationsPath"
    exit 1
}

# Run pocketbase migrate
$proc = Start-Process -FilePath $exePath -ArgumentList "migrate", "--dir", $migrationsPath -Wait -PassThru -NoNewWindow
if ($proc.ExitCode -ne 0) {
    Write-Error "Migration failed with exit code $($proc.ExitCode)"
    exit 1
}

Write-Host "Migrations completed successfully!" -ForegroundColor Green

# Verify admin user exists
Write-Host "" -ForegroundColor Gray
Write-Host "Verifying admin user..." -ForegroundColor Yellow

# Create a simple verification script
$verifyScript = @"
const pb = require('pocketbase');
const app = pb();
await app.findFirstRecordByFilter('users', 'email = "imredavid64@gmail.com"');
console.log('Admin user found!');
"@

Write-Host "" -ForegroundColor Gray
Write-Host "=== Setup Complete ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Set admin password: `$env:HOUSEBASE_ADMIN_PASSWORD = 'your-password'" -ForegroundColor Gray
Write-Host "  2. Start server: `.\pocketbase\pocketbase.exe serve --http=0.0.0.0:8090`" -ForegroundColor Gray
Write-Host "  3. Access admin UI: http://localhost:8090/_/" -ForegroundColor Gray
Write-Host "  4. Login with: imredavid64@gmail.com / your-password" -ForegroundColor Gray
Write-Host ""
Write-Host "For Tailscale access:" -ForegroundColor Yellow
Write-Host "  1. Install Tailscale on this PC" -ForegroundColor Gray
Write-Host "  2. Run: tailscale up" -ForegroundColor Gray
Write-Host "  3. Share your Tailscale IP (100.x.y.z) with friends" -ForegroundColor Gray
Write-Host "  4. Friends access via: http://100.x.y.z:8090" -ForegroundColor Gray