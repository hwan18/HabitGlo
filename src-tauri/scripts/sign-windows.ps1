param(
  [Parameter(Mandatory = $true)]
  [string]$TargetPath
)

$ErrorActionPreference = 'Stop'

function Get-SignToolPath {
  if (-not [string]::IsNullOrWhiteSpace($env:HABITGLO_SIGNTOOL_PATH) -and (Test-Path -LiteralPath $env:HABITGLO_SIGNTOOL_PATH)) {
    return (Resolve-Path -LiteralPath $env:HABITGLO_SIGNTOOL_PATH).Path
  }

  $cmd = Get-Command signtool.exe -ErrorAction SilentlyContinue
  if ($cmd) {
    return $cmd.Source
  }

  $kitRoot = Join-Path ${env:ProgramFiles(x86)} 'Windows Kits\10\bin'
  if (Test-Path -LiteralPath $kitRoot) {
    $candidate = Get-ChildItem -Path $kitRoot -Recurse -Filter signtool.exe -ErrorAction SilentlyContinue |
      Sort-Object -Property FullName -Descending |
      Select-Object -First 1
    if ($candidate) {
      return $candidate.FullName
    }
  }

  throw 'signtool.exe not found. Install Windows SDK or set HABITGLO_SIGNTOOL_PATH.'
}

$resolvedTargetPath = (Resolve-Path -LiteralPath $TargetPath).Path
$thumbprint = ($env:HABITGLO_CERT_THUMBPRINT -replace '\s', '').ToUpperInvariant()

if ([string]::IsNullOrWhiteSpace($thumbprint)) {
  throw 'HABITGLO_CERT_THUMBPRINT is required (SHA1 thumbprint of the installed code-signing cert).'
}
if ($thumbprint -notmatch '^[A-F0-9]{40}$') {
  throw 'HABITGLO_CERT_THUMBPRINT must be a 40-character SHA1 hex thumbprint.'
}

$timestampUrl = if ([string]::IsNullOrWhiteSpace($env:HABITGLO_TIMESTAMP_URL)) {
  'http://timestamp.digicert.com'
} else {
  $env:HABITGLO_TIMESTAMP_URL
}

$appName = if ([string]::IsNullOrWhiteSpace($env:HABITGLO_SIGN_APP_NAME)) {
  'HabitGlo'
} else {
  $env:HABITGLO_SIGN_APP_NAME
}

$useRfc3161 = $true
if (-not [string]::IsNullOrWhiteSpace($env:HABITGLO_TIMESTAMP_RFC3161)) {
  $value = $env:HABITGLO_TIMESTAMP_RFC3161.Trim().ToLowerInvariant()
  $useRfc3161 = @('1', 'true', 'yes', 'y') -contains $value
}

$signToolPath = Get-SignToolPath
$signArgs = @(
  'sign',
  '/sha1', $thumbprint,
  '/fd', 'sha256',
  '/d', $appName,
  '/v'
)

if ($useRfc3161) {
  $signArgs += @('/tr', $timestampUrl, '/td', 'sha256')
} else {
  $signArgs += @('/t', $timestampUrl)
}

$signArgs += $resolvedTargetPath

Write-Host "Signing: $resolvedTargetPath"
& $signToolPath @signArgs

if ($LASTEXITCODE -ne 0) {
  throw "signtool.exe failed with exit code $LASTEXITCODE"
}

Write-Host 'Signing completed.'
