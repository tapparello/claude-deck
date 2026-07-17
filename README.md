# Claude Deck — Stream Deck plugin

Live Claude usage gauges, running Claude Code sessions, and quick-launch keys for the Elgato Stream Deck (Windows).

The usage gauges show the **same session/weekly percentages Claude Desktop and Claude Code's `/usage` display** — pulled with your local Claude sign-in, refreshed every 60 seconds. No extra login, nothing leaves your machine.

## Keys

| Key | What it shows / does |
|---|---|
| **Session 5h** | Live 5-hour limit % ring + reset countdown. Press to refresh. |
| **Weekly** | Weekly limit % ring + per-model weekly % underneath. |
| **Today** | Today's Claude Code activity: chats, messages, tokens. |
| **Sessions** | Count of running Claude Code sessions and how many are busy (5s refresh). Press to cycle per-session details. |
| **Launch Claude Desktop** | Opens the Claude Desktop app (Microsoft Store install auto-detected). |
| **Quick Chat** | Fires Claude's global quick-chat hotkey (Ctrl+Alt+Space). |
| **Open claude.ai** | New chat in your browser. |
| **Claude Code Terminal** | Opens a terminal running `claude` in `Documents\GitHub` (falls back to your home folder). |

Ring colors: green < 60%, amber 60–85%, red ≥ 85%.

## Requirements

- Windows, Stream Deck software 6.5+ (Node.js plugin runtime)
- [Claude Code](https://claude.com/claude-code) signed in (provides `~/.claude/.credentials.json`, session and activity data)
- Claude Desktop (optional, for the launcher/quick-chat keys)

## Install

1. Download/clone this repo.
2. Close the Stream Deck app.
3. Copy `com.technicallybrantley.claude-deck.sdPlugin` into `%APPDATA%\Elgato\StreamDeck\Plugins\`.
4. Start the Stream Deck app — the actions appear under the **Claude Deck** category.
5. Optional: double-click `Claude.streamDeckProfile` to import a ready-made Stream Deck XL profile.

## Build from source

```powershell
npm install
npm run build      # bundles src/plugin.js -> com.technicallybrantley.claude-deck.sdPlugin/bin/plugin.mjs
npm run selftest   # exercises the usage endpoint + local data without Stream Deck
```

The plugin speaks the Stream Deck WebSocket protocol directly — the only runtime dependency is `ws`. Debug log: `claude-deck.log` inside the installed plugin folder.

## How usage data works

- **Limits**: `GET https://api.anthropic.com/api/oauth/usage` authorized with the OAuth token Claude Code keeps in `~/.claude/.credentials.json`. This is the same source the `/usage` command uses. It is not a publicly documented API, so it may change; the plugin logs the raw response shape to make fixes easy.
- **Sessions**: `~/.claude/sessions/*.json`, filtered to live processes.
- **Today**: parsed from `~/.claude/projects/**/*.jsonl` transcripts (Claude Code activity only — desktop chats don't write local logs, though they do count toward the limit gauges).

## Notes

- Not affiliated with or endorsed by Anthropic. The spark icons are original artwork drawn in a similar spirit; official Anthropic/Claude logos are trademarks and are not included.
- Usage percentages are account-wide, so desktop app, claude.ai, and Claude Code usage all show up in the gauges.

## License

MIT
