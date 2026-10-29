#Requires -Version 7.0
<#
.SYNOPSIS
  Install dsh-corner-alert into a DeepSeek Harness (DSH) profile (Windows).

.DESCRIPTION
  Copies the plugin next to your DSH home and registers it into the chosen profile.
  Prefers the `dsh plugin` CLI (which also updates dsh.profile.bundles); falls back
  to editing package.json + pnpm install when the CLI is unavailable.

.PARAMETER Profile
  DSH profile name. Defaults to $env:DSH_PROFILE or 'desktop'.

.PARAMETER DshHome
  DSH home directory. Defaults to $env:DSH_HOME or "$HOME\.dsh".

.EXAMPLE
  ./install.ps1 -Profile desktop

.EXAMPLE
  ./install.ps1 -Profile web
#>
param(
    [string]$Profile = $(if ($env:DSH_PROFILE) { $env:DSH_PROFILE } else { 'desktop' }),
    [string]$DshHome = $(if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $HOME '.dsh' })
)
$ErrorActionPreference = 'Stop'

$src  = Split-Path -Parent $MyInvocation.MyCommand.Path
$dest = Join-Path $DshHome "plugins\dsh-corner-alert"
$prof = Join-Path $DshHome "profiles\$Profile"

Write-Host "[1/3] copy plugin -> $dest"
New-Item -ItemType Directory -Force -Path (Split-Path $dest) | Out-Null
if ((Resolve-Path $src).Path -ne (Resolve-Path $dest -ErrorAction SilentlyContinue).Path) {
    if (-not (Test-Path $dest)) { New-Item -ItemType Directory -Force -Path $dest | Out-Null }
    robocopy $src $dest /E /NFL /NDL /NJH /NJS /NP /XF *.bak *.bak-* *.log | Out-Null
}

if (-not (Test-Path $prof)) {
    throw "Profile '$Profile' not found at $prof. Start DSH once with that profile first, then re-run."
}

$destPosix = $dest -replace '\\', '/'
$dsh = Get-Command dsh -ErrorAction SilentlyContinue

if ($dsh) {
    Write-Host "[2/3] dsh plugin --profile $Profile add file:$destPosix"
    & $dsh.Source plugin --profile $Profile add ("file:$destPosix")
    if ($LASTEXITCODE -ne 0) { throw "dsh plugin add failed (exit $LASTEXITCODE)" }
}
else {
    Write-Host "[2/3] dsh CLI not found; editing package.json + pnpm install"
    $pkgPath = Join-Path $prof 'package.json'
    $pkg = Get-Content -LiteralPath $pkgPath -Raw | ConvertFrom-Json
    if (-not $pkg.dependencies) { $pkg | Add-Member -NotePropertyName dependencies -NotePropertyValue ([pscustomobject]@{}) }
    $depValue = "file:$destPosix"
    $pkg.dependencies | Add-Member -NotePropertyName 'dsh-corner-alert' -NotePropertyValue $depValue -Force
    $bundles = @()
    if ($pkg.dsh -and $pkg.dsh.profile -and $pkg.dsh.profile.bundles) { $bundles = @($pkg.dsh.profile.bundles) }
    if ($bundles -notcontains 'dsh-corner-alert') {
        if (-not $pkg.dsh) { $pkg | Add-Member -NotePropertyName dsh -NotePropertyValue ([pscustomobject]@{}) }
        if (-not $pkg.dsh.profile) { $pkg.dsh | Add-Member -NotePropertyName profile -NotePropertyValue ([pscustomobject]@{}) }
        $pkg.dsh.profile | Add-Member -NotePropertyName bundles -NotePropertyValue (@($bundles) + 'dsh-corner-alert') -Force
    }
    $pkg | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath $pkgPath -Encoding utf8
    $pnpm = Get-Command pnpm -ErrorAction SilentlyContinue
    if ($pnpm) {
        Push-Location $prof
        try { & $pnpm.Source install } finally { Pop-Location }
    } else {
        Write-Host "   pnpm not found. Run 'pnpm install' in $prof before starting DSH."
    }
}

Write-Host "[3/3] done."
Write-Host "Next: restart DSH (or refresh the web UI). Verify with __dshCornerAlert.test() in the DevTools console."
Write-Host "Uninstall: dsh plugin --profile $Profile remove dsh-corner-alert"
