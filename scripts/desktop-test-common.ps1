# Shared helpers for scripts/smoke-desktop.ps1 and scripts/perf-desktop.ps1.
# The app under test always runs with a throwaway WebView2 profile, so the owner's reminders,
# sign-in and settings are never read or changed, and nothing is synced to Supabase.

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$script:RepoRoot = Split-Path -Parent $PSScriptRoot
$script:TauriDir = Join-Path $script:RepoRoot 'src-tauri'
$script:AppExe = Join-Path $script:TauriDir 'target\debug\habitglo.exe'
$script:ArtifactDir = Join-Path $script:RepoRoot 'docs\test-artifacts'
$script:DevUrl = (Get-Content (Join-Path $script:TauriDir 'tauri.conf.json') -Raw | ConvertFrom-Json).build.devPath
$script:DevPort = ([Uri]$script:DevUrl).Port

if (-not ('HabitGloTest.Native' -as [type])) {
  Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Text;

namespace HabitGloTest {
  public static class Native {
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
    delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumWindowsProc cb, IntPtr lParam);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr hWnd, StringBuilder sb, int max);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
    [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr hWnd, uint msg, IntPtr w, IntPtr l);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int cmd);
    [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
    [DllImport("user32.dll")] static extern bool SystemParametersInfo(uint action, uint param, ref RECT rect, uint winIni);

    [DllImport("user32.dll")] static extern bool PrintWindow(IntPtr hWnd, IntPtr hdc, uint flags);

    /// Renders one window's own pixels, even when other windows cover it.
    public static Bitmap CaptureWindow(IntPtr hWnd) {
      RECT r;
      GetWindowRect(hWnd, out r);
      var bmp = new Bitmap(Math.Max(1, r.Right - r.Left), Math.Max(1, r.Bottom - r.Top), PixelFormat.Format32bppArgb);
      using (var g = Graphics.FromImage(bmp)) {
        IntPtr hdc = g.GetHdc();
        try { PrintWindow(hWnd, hdc, 2 /* PW_RENDERFULLCONTENT */); } finally { g.ReleaseHdc(hdc); }
      }
      return bmp;
    }

    /// Live primary work area (WinForms caches Screen.WorkingArea, so it misses AppBar changes).
    public static Rectangle GetWorkArea() {
      var r = new RECT();
      SystemParametersInfo(0x0030, 0, ref r, 0);
      return Rectangle.FromLTRB(r.Left, r.Top, r.Right, r.Bottom);
    }

    public static IntPtr FindWindow(int pid, string title) {
      IntPtr found = IntPtr.Zero;
      EnumWindows((h, l) => {
        uint owner;
        GetWindowThreadProcessId(h, out owner);
        if (owner != (uint)pid) return true;
        var sb = new StringBuilder(256);
        GetWindowText(h, sb, sb.Capacity);
        if (sb.ToString() != title) return true;
        found = h;
        return false;
      }, IntPtr.Zero);
      return found;
    }

    /// Share of pixels (0..1) that differ by more than a small threshold. Both images must be the same size.
    public static double DiffRatio(Bitmap a, Bitmap b) {
      var rect = new Rectangle(0, 0, a.Width, a.Height);
      var da = a.LockBits(rect, ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
      var db = b.LockBits(rect, ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
      try {
        int len = da.Stride * a.Height;
        var ba = new byte[len];
        var bb = new byte[len];
        Marshal.Copy(da.Scan0, ba, 0, len);
        Marshal.Copy(db.Scan0, bb, 0, len);
        long diff = 0;
        for (int i = 0; i < len; i += 4) {
          int d = Math.Abs(ba[i] - bb[i]) + Math.Abs(ba[i + 1] - bb[i + 1]) + Math.Abs(ba[i + 2] - bb[i + 2]);
          if (d > 48) diff++;
        }
        return (double)diff / (a.Width * a.Height);
      } finally {
        a.UnlockBits(da);
        b.UnlockBits(db);
      }
    }
  }
}
'@
}
[void][HabitGloTest.Native]::SetProcessDPIAware()
Add-Type -AssemblyName System.Drawing, System.Windows.Forms, UIAutomationClient, UIAutomationTypes

function Write-Step([string]$message) {
  Write-Host ("[{0:HH:mm:ss}] {1}" -f (Get-Date), $message)
}

function Test-PortListening([int]$port) {
  [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
}

function Build-HabitGloDebug {
  # No `custom-protocol` feature: the binary loads devPath from the Vite dev server, like `tauri dev`.
  Write-Step 'cargo build --no-default-features (debug, dev server mode)'
  Push-Location $script:TauriDir
  try {
    cargo build --no-default-features
    if ($LASTEXITCODE -ne 0) { throw "cargo build failed ($LASTEXITCODE)" }
  } finally {
    Pop-Location
  }
}

$script:TestEnv = [ordered]@{
  WEBVIEW2_USER_DATA_FOLDER = $null  # set per run
  VITE_BILLING_GATE         = 'false'
  # posthog.ts throws in dev without a host, so point it somewhere unreachable instead of removing it.
  VITE_POSTHOG_HOST         = 'http://127.0.0.1:9'
}

function Start-HabitGloTestApp {
  param([switch]$SkipBuild, [switch]$NoApp, [string]$Exe)

  if ($Exe) {
    $script:AppExe = (Resolve-Path -LiteralPath $Exe).Path
    $SkipBuild = $true
  }
  $script:UseDevServer = $script:AppExe -notmatch '[\\/]release[\\/]'
  if (Get-Process -Name habitglo -ErrorAction SilentlyContinue) {
    throw 'HabitGlo is already running. Quit it from the tray first; the test will not touch a real session.'
  }
  if ($script:UseDevServer -and (Test-PortListening $script:DevPort)) {
    throw "Port $($script:DevPort) is already in use. Stop the other dev server first."
  }
  if (-not $SkipBuild) { Build-HabitGloDebug }
  if (-not (Test-Path $script:AppExe)) { throw "Missing $($script:AppExe); run without -SkipBuild." }

  New-Item -ItemType Directory -Force -Path $script:ArtifactDir | Out-Null
  $profileDir = Join-Path $env:TEMP ('habitglo-test-' + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $profileDir | Out-Null

  $saved = @{}
  foreach ($name in @($script:TestEnv.Keys)) {
    $saved[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
    $value = if ($name -eq 'WEBVIEW2_USER_DATA_FOLDER') { $profileDir } else { $script:TestEnv[$name] }
    [Environment]::SetEnvironmentVariable($name, $value, 'Process')
  }

  $ctx = [pscustomobject]@{ App = $null; Dev = $null; Profile = $profileDir; SavedEnv = $saved; DevLog = (Join-Path $profileDir 'vite.log') }
  try {
    if ($script:UseDevServer) {
    Write-Step "Starting Vite dev server on port $($script:DevPort)"
    # CreateNoWindow instead of -WindowStyle Hidden: Windows Terminal ignores the latter and opens a visible tab.
    $psi = New-Object System.Diagnostics.ProcessStartInfo 'cmd.exe', "/c npm run dev > `"$($ctx.DevLog)`" 2>&1"
    $psi.WorkingDirectory = $script:RepoRoot
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    $ctx.Dev = [System.Diagnostics.Process]::Start($psi)
    $deadline = (Get-Date).AddSeconds(90)
    while ($true) {
      try {
        $res = Invoke-WebRequest -Uri $script:DevUrl -UseBasicParsing -TimeoutSec 3
        if ($res.StatusCode -eq 200) { break }
      } catch { }
      if ((Get-Date) -gt $deadline) { throw "Dev server did not answer on $($script:DevUrl) within 90s" }
      Start-Sleep -Milliseconds 500
    }
    }

    if (-not $NoApp) {
      Write-Step 'Starting habitglo.exe with an isolated WebView2 profile'
      # Debug builds are console programs; CreateNoWindow keeps a terminal window from covering the app.
      $appPsi = New-Object System.Diagnostics.ProcessStartInfo $script:AppExe
      $appPsi.WorkingDirectory = $script:TauriDir
      $appPsi.UseShellExecute = $false
      $appPsi.CreateNoWindow = $true
      $ctx.App = [System.Diagnostics.Process]::Start($appPsi)
    }
    return $ctx
  } catch {
    Stop-HabitGloTestApp $ctx
    throw
  }
}

function Get-ProcessTree([int]$rootId) {
  $all = Get-CimInstance Win32_Process -Property ProcessId, ParentProcessId
  $ids = New-Object System.Collections.Generic.List[int]
  $ids.Add($rootId)
  for ($i = 0; $i -lt $ids.Count; $i++) {
    foreach ($p in $all) {
      if ($p.ParentProcessId -eq $ids[$i] -and -not $ids.Contains([int]$p.ProcessId)) { $ids.Add([int]$p.ProcessId) }
    }
  }
  return $ids.ToArray()
}

function Close-HabitGloStrip([int]$appId) {
  # Closing the strip goes through set_overlay_visibility(false), which gives reserved screen space back.
  $overlay = [HabitGloTest.Native]::FindWindow($appId, 'HabitGlo Overlay')
  if ($overlay -eq [IntPtr]::Zero -or -not [HabitGloTest.Native]::IsWindowVisible($overlay)) { return }
  [void][HabitGloTest.Native]::PostMessage($overlay, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero)
  $until = (Get-Date).AddSeconds(3)
  while ([HabitGloTest.Native]::IsWindowVisible($overlay) -and (Get-Date) -lt $until) { Start-Sleep -Milliseconds 100 }
}

function Stop-HabitGloTestApp($ctx) {
  if (-not $ctx) { return }
  if ($ctx.App -and -not $ctx.App.HasExited) {
    Close-HabitGloStrip $ctx.App.Id
    Write-Step 'Stopping habitglo.exe'
    & taskkill.exe /PID $ctx.App.Id /T /F 2>&1 | Out-Null
  }
  if ($ctx.Dev -and -not $ctx.Dev.HasExited) {
    Write-Step 'Stopping dev server'
    & taskkill.exe /PID $ctx.Dev.Id /T /F 2>&1 | Out-Null
  }
  # Anything still listening on the dev port was started by this run (the port was checked free at start).
  Get-NetTCPConnection -LocalPort $script:DevPort -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
  $leaf = Split-Path -Leaf $ctx.Profile
  Get-CimInstance Win32_Process -Filter "Name='msedgewebview2.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -and $_.CommandLine.Contains($leaf) } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

  foreach ($name in $ctx.SavedEnv.Keys) {
    [Environment]::SetEnvironmentVariable($name, $ctx.SavedEnv[$name], 'Process')
  }
  for ($i = 0; $i -lt 10 -and (Test-Path $ctx.Profile); $i++) {
    try { Remove-Item -Recurse -Force $ctx.Profile -ErrorAction Stop } catch { Start-Sleep -Milliseconds 500 }
  }
}

function Wait-AppWindow($ctx, [string]$title, [int]$timeoutSec = 60, [switch]$Visible) {
  $deadline = (Get-Date).AddSeconds($timeoutSec)
  while ((Get-Date) -lt $deadline) {
    if ($ctx.App.HasExited) { throw "habitglo.exe exited early (code $($ctx.App.ExitCode))" }
    $h = [HabitGloTest.Native]::FindWindow($ctx.App.Id, $title)
    if ($h -ne [IntPtr]::Zero -and (-not $Visible -or [HabitGloTest.Native]::IsWindowVisible($h))) { return $h }
    Start-Sleep -Milliseconds 250
  }
  throw "Window '$title' did not appear within ${timeoutSec}s"
}

function Get-WindowBounds([IntPtr]$hwnd) {
  $r = New-Object HabitGloTest.Native+RECT
  [void][HabitGloTest.Native]::GetWindowRect($hwnd, [ref]$r)
  [System.Drawing.Rectangle]::FromLTRB($r.Left, $r.Top, $r.Right, $r.Bottom)
}

function Get-PrimaryScreenBitmap {
  $b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
  $bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  try { $g.CopyFromScreen($b.Left, $b.Top, 0, 0, $bmp.Size) } finally { $g.Dispose() }
  return $bmp
}

function Get-Crop([System.Drawing.Bitmap]$bmp, [System.Drawing.Rectangle]$rect) {
  $screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
  $local = [System.Drawing.Rectangle]::Intersect(
    [System.Drawing.Rectangle]::new($rect.X - $screen.X, $rect.Y - $screen.Y, $rect.Width, $rect.Height),
    [System.Drawing.Rectangle]::new(0, 0, $bmp.Width, $bmp.Height))
  if ($local.Width -le 0 -or $local.Height -le 0) { return $null }
  return $bmp.Clone($local, $bmp.PixelFormat)
}

function Get-UiaWindow($ctx, [string]$title, [int]$timeoutSec = 30) {
  $cond = New-Object System.Windows.Automation.AndCondition(
    (New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ProcessIdProperty, $ctx.App.Id)),
    (New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, $title)))
  $deadline = (Get-Date).AddSeconds($timeoutSec)
  while ((Get-Date) -lt $deadline) {
    $el = [System.Windows.Automation.AutomationElement]::RootElement.FindFirst([System.Windows.Automation.TreeScope]::Children, $cond)
    if ($el) { return $el }
    Start-Sleep -Milliseconds 250
  }
  throw "UI Automation could not find window '$title'"
}

function Find-UiaButton($window, [string]$name, [int]$timeoutSec = 20) {
  $cond = New-Object System.Windows.Automation.AndCondition(
    (New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Button)),
    (New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, $name)))
  $deadline = (Get-Date).AddSeconds($timeoutSec)
  # WebView2 builds its accessibility tree lazily after the first UI Automation query, so poll.
  while ((Get-Date) -lt $deadline) {
    $el = $window.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $cond)
    if ($el) { return $el }
    Start-Sleep -Milliseconds 300
  }
  return $null
}

function Invoke-UiaButton($window, [string]$name, [int]$timeoutSec = 20) {
  $el = Find-UiaButton $window $name $timeoutSec
  if (-not $el) { throw "Button '$name' not found" }
  # Buttons with aria-pressed are exposed as toggles, not invokables.
  $pattern = $null
  if ($el.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$pattern)) { $pattern.Invoke(); return }
  if ($el.TryGetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern, [ref]$pattern)) { $pattern.Toggle(); return }
  throw "Button '$name' supports neither Invoke nor Toggle"
}
