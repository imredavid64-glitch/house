param(
  [string]$Port = "8090",
  [switch]$DevFrontend,
  [switch]$Stop,
  [switch]$Tailscale
)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$pbDir = Join-Path $root "pocketbase"
$pbExe = Join-Path $pbDir "pocketbase.exe"
$front = Join-Path $root "frontend"

function Get-LanIp {
  $ip = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notmatch "^127\.|^169\.254" } |
    Sort-Object InterfaceMetric | Select-Object -First 1).IPAddress
  return $ip
}

function StopPb {
  Get-Process -Name pocketbase -ErrorAction SilentlyContinue | Stop-Process -Force
  "Stopped PocketBase."
}

if ($Stop) {
  StopPb
  Get-Process -Name node -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "*node*" } | Stop-Process -Force
  "Stopped background processes."
  exit 0
}

if (-not (Test-Path $pbExe)) {
  Write-Error "pocketbase.exe not found at $pbExe. Run scripts\setup-pocketbase.ps1 first."
}

Get-Process -Name pocketbase -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep 1

$proc = Start-Process -FilePath $pbExe -ArgumentList "serve", "--http", "0.0.0.0:$Port" -WorkingDirectory $pbDir -WindowStyle Hidden -PassThru
"PocketBase starting (PID $($proc.Id)) on port $Port..."

$healthy = $false
for ($i = 0; $i -lt 30; $i++) {
  Start-Sleep 1
  try {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/api/health" -UseBasicParsing -TimeoutSec 3
    if ($r.StatusCode -eq 200) { $healthy = $true; break }
  } catch {}
}
if (-not $healthy) { Write-Error "PocketBase failed to become healthy on port $Port" }

"Health: OK ($($r.Content | ConvertFrom-Json).message)"

if ($DevFrontend) {
  $frontProc = Start-Process -FilePath "npm.cmd" -ArgumentList "run", "dev", "--", "--port", "5173", "--strictPort" -WorkingDirectory $front -WindowStyle Hidden -PassThru
  "Frontend dev server starting (PID $($frontProc.Id))..."
  Start-Sleep 6
  "Frontend: http://localhost:5173"
}

$lan = Get-LanIp
if ($lan) { "LAN access: http://$lan`:$Port" }
"Admin dashboard: http://localhost:$Port/_/"

if ($Tailscale) {
  $ts = "C:\Program Files\Tailscale\tailscale.exe"
  if (Test-Path $ts) {
    $ip = & $ts ip -4 2>$null | Select-Object -First 1
    if ($ip) { "Tailscale IP: $ip" }
    & $ts serve status 2>$null
  } else {
    "Tailscale not installed."
  }
}

"Production frontend: https://house-imredavid64-glitchs-projects.vercel.app"