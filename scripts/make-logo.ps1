# Renders the HabitGlo "After hours" logo: an amber 5x7 dot-matrix H on a warm near-black tile.
# Usage: powershell -ExecutionPolicy Bypass -File scripts/make-logo.ps1 -Out <dir>
param([string]$Out = "public/icons")

Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force $Out | Out-Null

$H = @(
  "10001",
  "10001",
  "10001",
  "11111",
  "10001",
  "10001",
  "10001"
)

function C([string]$hex, [int]$a = 255) {
  $c = [System.Drawing.ColorTranslator]::FromHtml($hex)
  [System.Drawing.Color]::FromArgb($a, $c.R, $c.G, $c.B)
}

function RoundRect([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $p.AddArc($x, $y, $d, $d, 180, 90)
  $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  $p
}

function Render([int]$S, [bool]$tile = $true) {
  $bmp = New-Object System.Drawing.Bitmap $S, $S, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.Clear([System.Drawing.Color]::Transparent)

  $small = $S -le 32

  if ($tile) {
    $inset = if ($small) { 0 } else { $S * 0.04 }
    $w = $S - 2 * $inset
    $path = RoundRect $inset $inset $w $w ($w * 0.23)
    $rect = New-Object System.Drawing.RectangleF $inset, $inset, $w, $w
    $bg = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect, (C "#211A13"), (C "#0E0B08"), 90
    $g.FillPath($bg, $path)
    if (-not $small) {
      $glowRect = New-Object System.Drawing.RectangleF ($S * 0.15), ($S * 0.35), ($S * 0.7), ($S * 0.75)
      $gp = New-Object System.Drawing.Drawing2D.GraphicsPath
      $gp.AddEllipse($glowRect)
      $pg = New-Object System.Drawing.Drawing2D.PathGradientBrush $gp
      $pg.CenterColor = C "#FFB000" 38
      $pg.SurroundColors = @([System.Drawing.Color]::FromArgb(0, 255, 176, 0))
      $g.SetClip($path)
      $g.FillEllipse($pg, $glowRect)
      $g.ResetClip()
      $pen = New-Object System.Drawing.Pen (C "#FFE2A8" 28), ([Math]::Max(1, $S * 0.006))
      $g.DrawPath($pen, $path)
    }
  }

  $pitch = if ($small) { $S * 0.125 } else { $S * 0.088 }
  $r = if ($small) { $S * 0.058 } else { $S * 0.033 }
  $gw = 4 * $pitch
  $gh = 6 * $pitch
  $x0 = ($S - $gw) / 2
  $y0 = ($S - $gh) / 2

  for ($row = 0; $row -lt 7; $row++) {
    for ($col = 0; $col -lt 5; $col++) {
      $cx = $x0 + $col * $pitch
      $cy = $y0 + $row * $pitch
      $lit = $H[$row][$col] -eq [char]"1"
      if ($lit) {
        if (-not $small) {
          $rr = $r * 2.5
          $dp = New-Object System.Drawing.Drawing2D.GraphicsPath
          $dp.AddEllipse($cx - $rr, $cy - $rr, 2 * $rr, 2 * $rr)
          $db = New-Object System.Drawing.Drawing2D.PathGradientBrush $dp
          $db.CenterColor = C "#FF9A00" 110
          $db.SurroundColors = @([System.Drawing.Color]::FromArgb(0, 255, 154, 0))
          $g.FillEllipse($db, $cx - $rr, $cy - $rr, 2 * $rr, 2 * $rr)
        }
        $b = New-Object System.Drawing.SolidBrush (C "#FFB000")
        $g.FillEllipse($b, $cx - $r, $cy - $r, 2 * $r, 2 * $r)
        if (-not $small) {
          $hr = $r * 0.6
          $hp = New-Object System.Drawing.Drawing2D.GraphicsPath
          $hp.AddEllipse($cx - $hr, $cy - $hr, 2 * $hr, 2 * $hr)
          $hb = New-Object System.Drawing.Drawing2D.PathGradientBrush $hp
          $hb.CenterColor = C "#FFF1C9" 200
          $hb.SurroundColors = @([System.Drawing.Color]::FromArgb(0, 255, 210, 110))
          $g.FillEllipse($hb, $cx - $hr, $cy - $hr, 2 * $hr, 2 * $hr)
        }
      } elseif (-not $small) {
        $ur = $r * 0.88
        $b = New-Object System.Drawing.SolidBrush (C "#3A2F22")
        $g.FillEllipse($b, $cx - $ur, $cy - $ur, 2 * $ur, 2 * $ur)
      }
    }
  }
  $g.Dispose()
  $bmp
}

function SavePng([int]$S, [string]$name) {
  $bmp = Render $S
  $path = Join-Path $Out $name
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  $path
}

function SaveIco([int[]]$sizes, [string]$name) {
  $blobs = foreach ($s in $sizes) {
    $bmp = Render $s
    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    , $ms.ToArray()
  }
  $fs = [System.IO.File]::Create((Join-Path $Out $name))
  $bw = New-Object System.IO.BinaryWriter $fs
  $bw.Write([uint16]0); $bw.Write([uint16]1); $bw.Write([uint16]$sizes.Count)
  $offset = 6 + 16 * $sizes.Count
  for ($i = 0; $i -lt $sizes.Count; $i++) {
    $s = $sizes[$i]
    $dim = if ($s -ge 256) { 0 } else { $s }
    $bw.Write([byte]$dim); $bw.Write([byte]$dim); $bw.Write([byte]0); $bw.Write([byte]0)
    $bw.Write([uint16]1); $bw.Write([uint16]32)
    $bw.Write([uint32]$blobs[$i].Length); $bw.Write([uint32]$offset)
    $offset += $blobs[$i].Length
  }
  foreach ($b in $blobs) { $bw.Write($b) }
  $bw.Close()
}

SavePng 1024 "habitglo-logo-1024.png" | Out-Null
SavePng 512 "habitglo-logo-512.png" | Out-Null
SavePng 192 "habitglo-logo-192.png" | Out-Null
SavePng 180 "habitglo-logo-180.png" | Out-Null
SavePng 32 "habitglo-logo-32.png" | Out-Null
SaveIco @(16, 24, 32, 48, 64, 128, 256) "habitglo-logo.ico"
Write-Output "Logo written to $Out"
