<#>
.SYNOPSIS
    House - Start Script
    Starts PocketBase backend and optionally the frontend dev server.

.DESCRIPTION
    This script:
    1. Checks if PocketBase is already running
    2. Starts PocketBase on port 8090 (binds to 0.0.0.0 for Tailscale)
    3. Optionally starts Vite dev server for frontend on port 5173
    4. Shows status and access URLs

.NOTES
    Run from the house repository root.
    For production, build the frontend first: `cd frontend && npm run build`
    Then serve the built files with PocketBase or a reverse proxy.
#>

param(
    [switch]$DevFrontend,
    [string]$Http = "0.0.0.0:8090",
    [switch]$NoFrontend
)

$ErrorActionPreference = "Stop"

Write-Host "=== House Start ===" -ForegroundColor Cyan
Write-Host ""

$repoRoot = Get-Location
$pbExe = Join-Path $repoRoot "pocketbase\pocketbase.exe"
$frontendDir = Join-Path $repoRoot "frontend"

# Check PocketBase exists
if (-not (Test-Path $pbExe)) {
    Write-Error "PocketBase not found at $pbExe"
    Write-Host "Run .\scripts\setup-pocketbase.ps1 first" -ForegroundColor Yellow
    exit 1
}

# Check if already running
$existingPb = Get-Process -Name "pocketbase" -ErrorAction SilentlyContinue
if ($existingPb) {
    Write-Host "PocketBase already running (PID: $($existingPb.Id))" -ForegroundColor Green
} else {
    Write-Host "Starting PocketBase on $Http..." -ForegroundColor Yellow
    $pbArgs = "serve", "--http=$Http"
    Start-Process -FilePath $pbExe -ArgumentList $pbArgs -NoNewWindow
    Start-Sleep -Seconds 2
    
    $pbProcess = Get-Process -Name "pocketbase" -ErrorAction SilentlyContinue
    if ($pbProcess) {
        Write-Host "PocketBase started (PID: $($pbProcess.Id))" -ForegroundColor Green
    } else {
        Write-Error "Failed to start PocketBase"
        exit 1
    }
}

# Get Tailscale IP if available
$tailscaleIp = $null
try {
    $tsOutput = tailscale ip -4 2>$null
    if ($tsOutput) {
        $tailscaleIp = $tsOutput.Trim()
    }
} catch {}

# Frontend
if (-not $NoFrontend) {
    if ($DevFrontend) {
        Write-Host "" -ForegroundColor Gray
        Write-Host "Starting Vite dev server..." -ForegroundColor Yellow
        Write-Host "Note: Frontend will proxy API calls to PocketBase" -ForegroundColor Gray
        
        if (-not (Test-Path (Join-Path $frontendDir "node_modules"))) {
            Write-Host "Installing frontend dependencies..." -ForegroundColor Yellow
            Set-Location $frontendDir
            npm install
            Set-Location $repoRoot
        }
        
        Set-Location $frontendDir
        Start-Process -FilePath "npm" -ArgumentList "run", "dev" -NoNewWindow
        Set-Location $repoRoot
        Write-Host "Vite dev server starting at http://localhost:5173" -ForegroundColor Green
    } else {
        # Check for built frontend
        $distDir = Join-Path $frontendDir "dist"
        if (Test-Path $distDir) {
            Write-Host "" -ForegroundColor Gray
            Write-Host "Built frontend found at $distDir" -ForegroundColor Green
            Write-Host "PocketBase will serve static files from pb_public if configured" -ForegroundColor Gray
        } else {
            Write-Host "" -ForegroundColor Gray
            Write-Host "No built frontend found. Run:" -ForegroundColor Yellow
            Write-Host "  cd frontend && npm run build" -ForegroundColor Gray
            Write-Host "Or use -DevFrontend for development" -ForegroundColor Gray
        }
    }
}

# Display access info
Write-Host "" -ForegroundColor Gray
Write-Host "=== Access URLs ===" -ForegroundColor Cyan
Write-Host "Local (this PC):" -ForegroundColor Yellow
Write-Host "  PocketBase Admin: http://localhost:8090/_/" -ForegroundColor Gray
Write-Host "  PocketBase API:   http://localhost:8090/api/" -ForegroundColor Gray
if ($DevFrontend) {
    Write-Host "  Frontend Dev:     http://localhost:5173" -ForegroundColor Gray
}

if ($tailscaleIp) {
    Write-Host "" -ForegroundColor Gray
    Write-Host "Tailscale (friends on your Tailnet):" -ForegroundColor Yellow
    Write-Host "  PocketBase Admin: http://$tailscaleIp:8090/_/" -ForegroundColor Gray
    Write-Host "  PocketBase API:   http://$tailscaleIp:8090/api/" -ForegroundColor Gray
    if ($DevFrontend) {
        Write-Host "  Frontend Dev:     http://$tailscaleIp:5173 (needs Vite config update)" -ForegroundColor Gray
    }
    Write-Host "" -ForegroundColor Gray
    Write-Host "Share this Tailscale IP with friends: $tailscaleIp" -ForegroundColor Cyan
} else {
    Write-Host "" -ForegroundColor Gray
    Write-Host "Tailscale: Not detected. Install Tailscale and run 'tailscale up' for remote access." -ForegroundColor Yellow
}

Write-Host "" -ForegroundColor Gray
Write-Host "Admin login: imredavid64@gmail.com" -ForegroundColor Gray
Write-Host "Press Ctrl+C to stop all servers" -ForegroundColor Gray

# Keep script running
try {
    while ($true) { Start-Sleep -Seconds 10 }
} catch {
    Write-Host "`nShutting down..." -ForegroundColor Yellow
    Get-Process -Name "pocketbase" -ErrorAction SilentlyContinue | Stop-Process -Force
    if ($DevFrontend) { Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "*vite*" } | Stop-Process -Force }
    Write-Host "Stopped" -ForegroundColor Green
}