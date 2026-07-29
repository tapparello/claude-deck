# Deploys the plugin to Stream Deck. If local-assets\claude-logo.png exists
# (not in the repo — drop in your own copy of the official icon for personal use),
# it replaces the launcher and plugin icons in the deployed copy only.
param([switch]$NoRestart)

$src = Join-Path $PSScriptRoot "dev.tapparello.agent-vitals.sdPlugin"
$dst = Join-Path $env:APPDATA "Elgato\StreamDeck\Plugins\dev.tapparello.agent-vitals.sdPlugin"

Stop-Process -Name StreamDeck -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
if (Test-Path $dst) { Remove-Item $dst -Recurse -Force }
Copy-Item $src $dst -Recurse

$logo = Join-Path $PSScriptRoot "local-assets\claude-logo.png"
if (Test-Path $logo) {
    Copy-Item $logo (Join-Path $dst "imgs\launch.png") -Force
    Remove-Item (Join-Path $dst "imgs\launch.svg") -Force
    Copy-Item $logo (Join-Path $dst "imgs\plugin.png") -Force
    Write-Host "applied local claude-logo.png to the launch + plugin icons"
}

if (-not $NoRestart) { Start-Process "C:\Program Files\Elgato\StreamDeck\StreamDeck.exe" }
Write-Host "deployed to $dst"
