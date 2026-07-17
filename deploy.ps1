# Deploys the plugin to Stream Deck. If local-assets\claude-logo.png exists
# (not in the repo — drop in your own copy of the official icon for personal use),
# it replaces the launcher and category icons in the deployed copy only.
param([switch]$NoRestart)

$src = Join-Path $PSScriptRoot "com.technicallybrantley.claude-deck.sdPlugin"
$dst = Join-Path $env:APPDATA "Elgato\StreamDeck\Plugins\com.technicallybrantley.claude-deck.sdPlugin"

Stop-Process -Name StreamDeck -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
if (Test-Path $dst) { Remove-Item $dst -Recurse -Force }
Copy-Item $src $dst -Recurse

$logo = Join-Path $PSScriptRoot "local-assets\claude-logo.png"
if (Test-Path $logo) {
    Copy-Item $logo (Join-Path $dst "imgs\launch.png") -Force
    Remove-Item (Join-Path $dst "imgs\launch.svg") -Force
    Copy-Item $logo (Join-Path $dst "imgs\plugin.png") -Force
    Remove-Item (Join-Path $dst "imgs\plugin.svg") -Force
    # Quick-chat icon: speech bubble with the real logo inside
    $b64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($logo))
    $chat = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="72" height="72" viewBox="0 0 72 72"><rect width="72" height="72" rx="14" fill="#1F1E1D"/><path d="M14 19 h44 a6 6 0 0 1 6 6 v19 a6 6 0 0 1 -6 6 h-23 l-13 11 v-11 h-8 a6 6 0 0 1 -6 -6 v-19 a6 6 0 0 1 6 -6 z" fill="none" stroke="#D97757" stroke-width="4"/><image xlink:href="data:image/png;base64,' + $b64 + '" href="data:image/png;base64,' + $b64 + '" x="21" y="20" width="30" height="30"/></svg>'
    Set-Content -Path (Join-Path $dst "imgs\chat.svg") -Value $chat -Encoding UTF8
    Write-Host "applied local claude-logo.png to launch, category, and chat icons"
}

if (-not $NoRestart) { Start-Process "C:\Program Files\Elgato\StreamDeck\StreamDeck.exe" }
Write-Host "deployed to $dst"
