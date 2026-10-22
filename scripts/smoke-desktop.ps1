# Launch + screenshot smoke test for the real desktop app.
# Usage: powershell -ExecutionPolicy Bypass -File scripts/smoke-desktop.ps1 [-SkipBuild]
# Output: docs/test-artifacts/smoke-*.png and smoke-result.json. Exit code 0 = pass.
param([switch]$SkipBuild)

. (Join-Path $PSScriptRoot 'desktop-test-common.ps1')

$ctx = $null
$result = [ordered]@{ ranAt = (Get-Date).ToString('s'); pass = $false; checks = [ordered]@{} }
try {
  $ctx = Start-HabitGloTestApp -SkipBuild:$SkipBuild
  $main = Wait-AppWindow $ctx 'HabitGlo' -Visible
  $overlay = Wait-AppWindow $ctx 'HabitGlo Overlay' -Visible
  Write-Step 'Both windows are visible'
  $shownAt = Get-Date

  $screen = [System.Windows.Forms.Screen]::PrimaryScreen
  $shots = @()
  foreach ($second in 2, 5) {
    $wait = $shownAt.AddSeconds($second) - (Get-Date)
    if ($wait.TotalMilliseconds -gt 0) { Start-Sleep -Milliseconds ([int]$wait.TotalMilliseconds) }
    $strip = Get-WindowBounds $overlay
    $bmp = Get-PrimaryScreenBitmap
    $bmp.Save((Join-Path $script:ArtifactDir "smoke-full-${second}s.png"), [System.Drawing.Imaging.ImageFormat]::Png)
    $crop = Get-Crop $bmp $strip
    if ($crop) { $crop.Save((Join-Path $script:ArtifactDir "smoke-strip-${second}s.png"), [System.Drawing.Imaging.ImageFormat]::Png) }
    if ($second -eq 5) {
      $mainShot = [HabitGloTest.Native]::CaptureWindow($main)
      $mainShot.Save((Join-Path $script:ArtifactDir 'smoke-main-window.png'), [System.Drawing.Imaging.ImageFormat]::Png)
      $mainShot.Dispose()
    }
    $bmp.Dispose()
    $shots += [pscustomobject]@{ Second = $second; Strip = $strip; Crop = $crop }
    Write-Step "Screenshot at ${second}s"
  }

  $strip = $shots[1].Strip
  $work = [HabitGloTest.Native]::GetWorkArea()
  $c = $result.checks
  $c.overlayVisible = [HabitGloTest.Native]::IsWindowVisible($overlay)
  $c.stripBounds = "$($strip.X),$($strip.Y) $($strip.Width)x$($strip.Height)"
  $c.screenBounds = "$($screen.Bounds.X),$($screen.Bounds.Y) $($screen.Bounds.Width)x$($screen.Bounds.Height)"
  $c.workArea = "$($work.X),$($work.Y) $($work.Width)x$($work.Height)"
  $c.dockedAtTop = ($strip.Y -eq $screen.Bounds.Y)
  $c.fullWidth = ($strip.X -eq $screen.Bounds.X -and $strip.Width -eq $screen.Bounds.Width)
  # Reserve space is on by default, so the work area should start right under the strip.
  $c.spaceReserved = ($work.Y -ge $strip.Bottom)
  $c.stripMoved = $false
  if ($shots[0].Crop -and $shots[1].Crop -and $shots[0].Crop.Size -eq $shots[1].Crop.Size) {
    $ratio = [HabitGloTest.Native]::DiffRatio($shots[0].Crop, $shots[1].Crop)
    $c.stripDiffRatio = [math]::Round($ratio, 4)
    $c.stripMoved = $ratio -gt 0.01
  }
  foreach ($s in $shots) { if ($s.Crop) { $s.Crop.Dispose() } }
} catch {
  $result.error = $_.Exception.Message
  Write-Warning $_.Exception.Message
} finally {
  Stop-HabitGloTestApp $ctx
  if ($ctx) {
    $after = [HabitGloTest.Native]::GetWorkArea()
    $result.checks.workAreaAfterQuit = "$($after.X),$($after.Y) $($after.Width)x$($after.Height)"
    $result.checks.spaceReleased = ($after.Y -eq [System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Y)
  }
}
$c = $result.checks
$result.pass = [bool](-not $result.Contains('error') -and $c.overlayVisible -and $c.dockedAtTop -and $c.fullWidth -and $c.stripMoved -and $c.spaceReleased)

$json = $result | ConvertTo-Json -Depth 4
Set-Content -Path (Join-Path $script:ArtifactDir 'smoke-result.json') -Value $json -Encoding ASCII
$json
if ($result.pass) { Write-Step 'SMOKE PASS'; exit 0 } else { Write-Step 'SMOKE FAIL'; exit 1 }
