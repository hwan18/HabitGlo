# Used by e2e/wdio.conf.mjs after a WebDriver session: frees the strip's reserved screen space, then ends
# habitglo.exe. The e2e runner refuses to start while a real HabitGlo is running, so every instance here is a test one.
. (Join-Path $PSScriptRoot 'desktop-test-common.ps1')

foreach ($app in @(Get-Process -Name habitglo -ErrorAction SilentlyContinue)) {
  Close-HabitGloStrip $app.Id
  & taskkill.exe /PID $app.Id /T /F 2>&1 | Out-Null
}
