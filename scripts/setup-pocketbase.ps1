param(
  [string]$Version = "0.40.2",
  [string]$Port = "8090"
)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$pbDir = Join-Path $root "pocketbase"
$pbExe = Join-Path $pbDir "pocketbase.exe"
$dataDir = Join-Path $pbDir "pb_data"

if (-not (Test-Path $pbExe)) {
  "Downloading PocketBase v$Version (windows_amd64)..."
  $url = "https://github.com/pocketbase/pocketbase/releases/download/v$Version/pocketbase_${Version}_windows_amd64.zip"
  $zip = Join-Path $env:TEMP "pocketbase_v$Version.zip"
  $ProgressPreference = "SilentlyContinue"
  Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing
  New-Item -ItemType Directory -Force -Path $pbDir | Out-Null
  Expand-Archive -Path $zip -DestinationPath $pbDir -Force
  Remove-Item $zip
  "Installed to $pbExe"
} else {
  "pocketbase.exe already present: $($pbExe)"
}

$running = Get-Process -Name pocketbase -ErrorAction SilentlyContinue
if ($running) {
  "PocketBase is already running (PID $($running.Id)). Applying migrations happens on next restart."
} else {
  "Applying migrations / preparing data (first run creates collection schema)..."
  $proc = Start-Process -FilePath $pbExe -ArgumentList "serve", "--http", "0.0.0.0:$Port" -WorkingDirectory $pbDir -WindowStyle Hidden -PassThru
  $healthy = $false
  for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep 1
    try {
      $r = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/api/health" -UseBasicParsing -TimeoutSec 3
      if ($r.StatusCode -eq 200) { $healthy = $true; break }
    } catch {}
  }
  if (-not $healthy) { Write-Error "PocketBase did not become healthy" }
  "Migrations applied (health OK). PocketBase left running (PID $($proc.Id))."
}

$adminPass = $env:HOUSEBASE_ADMIN_PASSWORD
if ($adminPass) {
  & $pbExe superuser upsert imredavid64@gmail.com $adminPass 2>$null
  if ($LASTEXITCODE -eq 0) { "Superuser imredavid64@gmail.com configured." }
}

"Done. Admin dashboard: http://localhost:$Port/_/  (login: imredavid64@gmail.com)"
"Next: .\scripts\start.ps1  (or -DevFrontend for the local dev server)"