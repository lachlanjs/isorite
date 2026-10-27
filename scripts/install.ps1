# Install isorite as one executable on Windows (M21), checked against the release's SHA256SUMS:
#   irm https://github.com/lachlanjs/isorite/releases/latest/download/install.ps1 | iex
#   .\install.ps1 [-Version 0.9.0] [-Dir $env:LOCALAPPDATA\isorite] [-Url <the executable's address>] [-Sha256 <its sum>]
# Every address it fetches is printed first, so it can be fetched by hand instead. -Url names the executable on a
# mirror; its SHA256SUMS is looked for beside it, or give -Sha256. Run again, it replaces the executable. The folder
# is added to your PATH (yours alone, not the machine's) if it isn't there. Works in Windows PowerShell 5.1 and pwsh.
param(
  [string]$Version = "",
  [string]$Dir = (Join-Path $env:LOCALAPPDATA "isorite"),
  [string]$Url = "",
  [string]$Sha256 = ""
)
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue" # Windows PowerShell's progress bar makes a download many times slower
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

$arch = if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64") { "arm64" } else { "x64" }
$name = "isorite-windows-$arch.exe"
if (-not $Url) {
  $base = if ($Version) { "https://github.com/lachlanjs/isorite/releases/download/v$($Version.TrimStart('v'))" } else { "https://github.com/lachlanjs/isorite/releases/latest/download" }
  $Url = "$base/$name"
}
$sums = $Url.Substring(0, $Url.LastIndexOf("/")) + "/SHA256SUMS"
$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("isorite-" + [guid]::NewGuid())
New-Item -ItemType Directory -Path $tmp | Out-Null
try {
  Write-Host "isorite: installing $name into $Dir"
  if (-not $Sha256) {
    Write-Host "  fetching $sums"
    # To a file: GitHub serves it as bytes, which Invoke-WebRequest's .Content leaves as bytes.
    Invoke-WebRequest -UseBasicParsing $sums -OutFile (Join-Path $tmp "SHA256SUMS")
    $line = Get-Content (Join-Path $tmp "SHA256SUMS") | Where-Object { $_.Trim() -match " \*?$([regex]::Escape($name))$" } | Select-Object -First 1
    if (-not $line) { throw "$sums doesn't list ${name}: give the executable's sum with -Sha256" }
    $Sha256 = ($line.Trim() -split "\s+")[0]
  }
  Write-Host "  fetching $Url"
  $exe = Join-Path $tmp "isorite.exe"
  Invoke-WebRequest -UseBasicParsing $Url -OutFile $exe
  $got = (Get-FileHash -Algorithm SHA256 $exe).Hash.ToLower()
  if ($got -ne $Sha256.ToLower()) { throw "$Url is not the file expected: its SHA-256 is $got, not $Sha256. Nothing was installed." }
  New-Item -ItemType Directory -Force -Path $Dir | Out-Null
  Move-Item -Force $exe (Join-Path $Dir "isorite.exe")
  Write-Host "isorite: $(& (Join-Path $Dir 'isorite.exe') --version) is $Dir\isorite.exe (SHA-256 $got)"
  $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
  if (-not (($userPath -split ";") -contains $Dir) -and -not (($env:PATH -split ";") -contains $Dir)) {
    $parts = @(($userPath -split ";") | Where-Object { $_ }) + $Dir
    [Environment]::SetEnvironmentVariable("Path", ($parts -join ";"), "User")
    $env:PATH = "$env:PATH;$Dir"
    Write-Host "  $Dir is added to your PATH: open a new terminal for isorite to be found there"
  }
  Write-Host "  next: isorite doctor, then isorite model (search by meaning) and isorite opencode (the terminal)"
} finally {
  Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}
