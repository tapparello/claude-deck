#!/usr/bin/env bash
# Deploys the plugin to Stream Deck on macOS. Mirrors deploy.ps1.
# If local-assets/claude-logo.png exists (gitignored — drop in your own copy of
# the official icon for personal use), it replaces the launcher and category
# icons in the deployed copy only.
set -euo pipefail

NO_RESTART=0
[ "${1:-}" = "--no-restart" ] && NO_RESTART=1

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$DIR/dev.tapparello.claude-deck.sdPlugin"
DST_DIR="$HOME/Library/Application Support/com.elgato.StreamDeck/Plugins"
DST="$DST_DIR/dev.tapparello.claude-deck.sdPlugin"

osascript -e 'quit app "Elgato Stream Deck"' 2>/dev/null || true
pkill -x "Elgato Stream Deck" 2>/dev/null || true
sleep 2

mkdir -p "$DST_DIR"
rm -rf "$DST"
cp -R "$SRC" "$DST"

LOGO="$DIR/local-assets/claude-logo.png"
if [ -f "$LOGO" ]; then
  cp "$LOGO" "$DST/imgs/launch.png"; rm -f "$DST/imgs/launch.svg"
  cp "$LOGO" "$DST/imgs/plugin.png"; rm -f "$DST/imgs/plugin.svg"
  echo "applied local claude-logo.png to launch + category icons"
fi

if [ "$NO_RESTART" -eq 0 ]; then
  open -a "Elgato Stream Deck"
fi
echo "deployed to $DST"
