# CPU / memory sampling of the real desktop app (habitglo.exe + its WebView2 processes).
# Usage: powershell -ExecutionPolicy Bypass -File scripts/perf-desktop.ps1 [-SkipBuild] [-Seconds 60]
# CPU % is the share of the whole machine (summed process CPU time / wall time / logical cores).
# Most of the scrolling cost is WebView2's GPU process composing frames at the display refresh rate, so it
# rises with other GPU load on the PC (video, games, other browsers). Run it on an otherwise quiet machine.
# Output: docs/test-artifacts/perf-result.json. Exit code 0 = all targets met.
param([switch]$SkipBuild, [int]$Seconds = 60)

. (Join-Path $PSScriptRoot 'desktop-test-common.ps1')

$targets = [ordered]@{ scrolling = 3.0; 'scrolling-window-in-tray' = 3.0; paused = 0.5; 'led-hidden' = 0.5 }

function Measure-AppState($ctx, [string]$name, [int]$seconds) {
  Start-Sleep -Seconds 3
  Write-Step "Sampling '$name' for ${seconds}s"
  $cores = [Environment]::ProcessorCount
  $tree = Get-ProcessTree $ctx.App.Id
  $prev = @{}
  foreach ($p in Get-Process -Id $tree -ErrorAction SilentlyContinue) { $prev[$p.Id] = $p.TotalProcessorTime.TotalMilliseconds }
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  $lastMs = 0
  $cpu = New-Object System.Collections.Generic.List[double]
  $mem = New-Object System.Collections.Generic.List[double]
  $perPid = @{}
  for ($i = 1; $i -le $seconds; $i++) {
    $sleep = $i * 1000 - $sw.ElapsedMilliseconds
    if ($sleep -gt 0) { Start-Sleep -Milliseconds $sleep }
    if ($i % 10 -eq 0) { $tree = Get-ProcessTree $ctx.App.Id }
    $nowMs = $sw.ElapsedMilliseconds
    $used = 0.0
    $ws = 0
    $next = @{}
    foreach ($p in Get-Process -Id $tree -ErrorAction SilentlyContinue) {
      $t = $p.TotalProcessorTime.TotalMilliseconds
      $next[$p.Id] = $t
      if ($prev.ContainsKey($p.Id)) {
        $used += $t - $prev[$p.Id]
        $perPid[$p.Id] = [double]$perPid[$p.Id] + ($t - $prev[$p.Id])
      }
      $ws += $p.WorkingSet64
    }
    $cpu.Add(100.0 * $used / (($nowMs - $lastMs) * $cores))
    $mem.Add($ws / 1MB)
    $prev = $next
    $lastMs = $nowMs
  }
  $avg = ($cpu | Measure-Object -Average).Average
  $max = ($cpu | Measure-Object -Maximum).Maximum
  $sorted = @($cpu | Sort-Object)
  # Which processes the CPU went to (share of one core), e.g. "gpu-process 18.2, renderer 3.1".
  $types = @{}
  foreach ($p in Get-CimInstance Win32_Process -Property ProcessId, Name, CommandLine | Where-Object { $perPid.ContainsKey([int]$_.ProcessId) }) {
    $types[[int]$p.ProcessId] = if ($p.CommandLine -match '--type=([\w-]+)') { $Matches[1] } else { $p.Name }
  }
  $top = ($perPid.GetEnumerator() | Sort-Object Value -Descending | Select-Object -First 3 |
    ForEach-Object { '{0} {1:N1}' -f $types[$_.Key], (100.0 * $_.Value / $sw.ElapsedMilliseconds) }) -join ', '
  [pscustomobject]@{
    state     = $name
    cpuAvg    = [math]::Round($avg, 3)
    cpuMedian = [math]::Round($sorted[[int][math]::Floor($sorted.Count / 2)], 3)
    cpuMax    = [math]::Round($max, 3)
    memAvgMB  = [math]::Round(($mem | Measure-Object -Average).Average, 1)
    processes = $tree.Count
    topProcesses = $top
    target    = $targets[$name]
    met       = $avg -lt $targets[$name]
  }
}

function Assert-That([bool]$condition, [string]$message) {
  if (-not $condition) { throw $message }
}

# Each run uses a brand-new WebView2 profile, and WebView2 spends its first ~30-60s on one-time work (GPU shader
# cache, first-run components) that a real install only does once. Wait for 5 quiet seconds before measuring.
function Wait-AppQuiet($ctx, [int]$timeoutSec = 150) {
  $tree = Get-ProcessTree $ctx.App.Id
  $prev = @{}
  foreach ($p in Get-Process -Id $tree -ErrorAction SilentlyContinue) { $prev[$p.Id] = $p.TotalProcessorTime.TotalMilliseconds }
  $quiet = 0
  for ($i = 1; $i -le $timeoutSec; $i++) {
    Start-Sleep -Seconds 1
    $used = 0.0
    foreach ($p in Get-Process -Id $tree -ErrorAction SilentlyContinue) {
      $t = $p.TotalProcessorTime.TotalMilliseconds
      if ($prev.ContainsKey($p.Id)) { $used += $t - $prev[$p.Id] }
      $prev[$p.Id] = $t
    }
    $quiet = if ($used -lt 50) { $quiet + 1 } else { 0 }  # under 5% of one core
    if ($quiet -ge 5) { return $i }
  }
  return -1
}

# The window sits minimized or behind other apps while people work, so the preview inside it is paused.
function Set-WindowState($window, [System.Windows.Automation.WindowVisualState]$state) {
  $window.GetCurrentPattern([System.Windows.Automation.WindowPattern]::Pattern).SetWindowVisualState($state)
  Start-Sleep -Milliseconds 500
}

$ctx = $null
$rows = @()
$result = [ordered]@{ ranAt = (Get-Date).ToString('s'); cores = [Environment]::ProcessorCount; seconds = $Seconds; pass = $false }
try {
  $ctx = Start-HabitGloTestApp -SkipBuild:$SkipBuild
  $mainHwnd = Wait-AppWindow $ctx 'HabitGlo' -Visible
  $overlayHwnd = Wait-AppWindow $ctx 'HabitGlo Overlay' -Visible
  $main = Get-UiaWindow $ctx 'HabitGlo'
  Assert-That ([bool](Find-UiaButton $main 'Pause' 30)) 'Expected the LED to be scrolling on first launch'
  $minimized = [System.Windows.Automation.WindowVisualState]::Minimized
  $normal = [System.Windows.Automation.WindowVisualState]::Normal
  # Paused first, so "quiet" means the warm-up is over rather than depending on the scrolling cost.
  Invoke-UiaButton $main 'Pause'
  Assert-That ([bool](Find-UiaButton $main 'Start')) 'Pause did not take effect'
  Set-WindowState $main $minimized
  $result.warmupSeconds = Wait-AppQuiet $ctx
  Write-Step "WebView2 first-run warm-up took $($result.warmupSeconds)s"
  $rows += Measure-AppState $ctx 'paused' $Seconds

  Set-WindowState $main $normal
  Invoke-UiaButton $main 'Start'
  Assert-That ([bool](Find-UiaButton $main 'Pause')) 'Start did not take effect'
  Set-WindowState $main $minimized
  $rows += Measure-AppState $ctx 'scrolling' $Seconds

  Set-WindowState $main $normal
  Invoke-UiaButton $main 'Hide LED'
  Start-Sleep -Seconds 1
  Assert-That (-not [HabitGloTest.Native]::IsWindowVisible($overlayHwnd)) 'Hide LED did not hide the strip'
  Set-WindowState $main $minimized
  $rows += Measure-AppState $ctx 'led-hidden' $Seconds

  Set-WindowState $main $normal
  Invoke-UiaButton $main 'Show LED'
  Start-Sleep -Seconds 1
  Assert-That ([HabitGloTest.Native]::IsWindowVisible($overlayHwnd)) 'Show LED did not show the strip'
  # Closing the main window hides it to the tray (CloseRequested -> hide_main_window).
  $main.GetCurrentPattern([System.Windows.Automation.WindowPattern]::Pattern).Close()
  Start-Sleep -Seconds 1
  Assert-That (-not [HabitGloTest.Native]::IsWindowVisible($mainHwnd)) 'Closing the window did not hide it to the tray'
  Assert-That ([HabitGloTest.Native]::IsWindowVisible($overlayHwnd)) 'The strip should keep running with the window in the tray'
  $rows += Measure-AppState $ctx 'scrolling-window-in-tray' $Seconds

  $result.pass = -not ($rows | Where-Object { -not $_.met })
} catch {
  $result.error = $_.Exception.Message
  Write-Warning $_.Exception.Message
} finally {
  Stop-HabitGloTestApp $ctx
}

$result.states = $rows
$json = $result | ConvertTo-Json -Depth 4
Set-Content -Path (Join-Path $script:ArtifactDir 'perf-result.json') -Value $json -Encoding ASCII
$rows | Format-Table -AutoSize | Out-String | Write-Host
if ($result.pass) { Write-Step 'PERF PASS'; exit 0 } else { Write-Step 'PERF FAIL'; exit 1 }
