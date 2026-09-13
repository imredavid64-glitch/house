param(
  [string]$Dest = "",
  [int]$KeepDays = 30,
  [switch]$RegisterTask
)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$dataDir = Join-Path $root "pocketbase\pb_data"
if (-not (Test-Path $dataDir)) { Write-Error "pb_data not found at $dataDir" }

if (-not $Dest) {
  if (Test-Path "D:\") { $Dest = "D:\HouseBackups" } else { $Dest = Join-Path $root "backups" }
}
New-Item -ItemType Directory -Force -Path $Dest | Out-Null

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$target = Join-Path $Dest "house-$stamp"
New-Item -ItemType Directory -Force -Path $target | Out-Null

Copy-Item (Join-Path $dataDir "data.db") $target -Force -ErrorAction SilentlyContinue
Copy-Item (Join-Path $dataDir "data.db-wal") $target -Force -ErrorAction SilentlyContinue
Copy-Item (Join-Path $dataDir "data.db-shm") $target -Force -ErrorAction SilentlyContinue
if (Test-Path (Join-Path $dataDir "storage")) {
  robocopy (Join-Path $dataDir "storage") (Join-Path $target "storage") /E /NFL /NDL /NJH /NJS /R:1 /W:1 | Out-Null
}
Append-Content (Join-Path $Dest "backup.log") "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') -> $target" -Encoding UTF8

Get-ChildItem -Directory $Dest -Filter "house-*" | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$KeepDays) } | ForEach-Object {
  Remove-Item -Recurse -Force $_.FullName
  Append-Content (Join-Path $Dest "backup.log") "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') pruned $($_.Name)" -Encoding UTF8
}

"Backup complete: $target"
"Retention: last $KeepDays days in $Dest"

if ($RegisterTask) {
  $task = "HouseBackup"
  $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$PSScriptRoot\backup.ps1`""
  $trigger = New-ScheduledTaskTrigger -Daily -At 3am
  Register-ScheduledTask -TaskName $task -Action $action -Trigger $trigger -Force | Out-Null
  "Scheduled daily backup at 3 AM registered as '$task'."
}