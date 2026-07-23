# Claude Deck — Stream Deck plugin

Live Claude usage gauges, running Claude Code sessions, and quick-launch keys for the Elgato Stream Deck (Windows and macOS).

The usage gauges show the **same session/weekly percentages Claude Desktop and Claude Code's `/usage` display** — pulled with your local Claude sign-in, refreshed every couple of minutes. No extra login, nothing leaves your machine.

![Claude Deck — live usage, sessions, and launchers on a Stream Deck XL](docs/shot1.png)

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
| **Model Usage (weekly)** | Per-model weekly limit % (e.g. your Fable allowance). |
| **Burn Rate** | Tokens/hour over the last hour + estimated time until the 5h session cap ("cap in ~1h 20m" / "steady"). |
| **Project Terminal** | Configurable: opens Claude Code in a specific project folder (label + path in key settings). |
| **Focus Session** | Press to cycle running sessions and bring each one's terminal window to the front. |
| **Quick Prompt** | Configurable: opens quick chat and pastes a canned prompt (optionally presses Enter). Overwrites the clipboard. |
| **Claude Custom** | A Claude-styled spare key that opens anything you set: app, URL, or folder. |

Bar colors: green < 60%, amber 60–85%, red ≥ 85%. At 90%+ the gauge pulses red.
The sessions key shows an animated dot cycle while any session is actively working.

| Limits at a glance | Agents at a glance |
|---|---|
| ![Session gauge pulsing red at 94%, burn rate, weekly gauge](docs/shot2.png) | ![Session count with activity dots, focus key, today's stats](docs/shot3.png) |

## Requirements

- Windows 10+ or macOS 11+, Stream Deck software 6.5+ (Node.js plugin runtime)
- [Claude Code](https://claude.com/claude-code) signed in — provides session and activity data, and the OAuth token used for the usage gauges (Windows: `~/.claude/.credentials.json`; macOS: the login Keychain, service `Claude Code-credentials`)
- Claude Desktop (optional, for the launcher / quick-chat keys)
- **macOS only:** the usage gauges show a live percentage only for a consumer Pro/Max subscription. On an enterprise/Foundry setup (no subscription limits) they read **n/a** — Sessions / Today / Burn Rate still work.
- **macOS only:** the Quick Chat, Quick Prompt, and Focus Session keys need Accessibility + Automation permission (see **macOS permissions** below).

## Install

1. Download/clone this repo.
2. Close the Stream Deck app.
3. Copy `com.technicallybrantley.claude-deck.sdPlugin` into your plugins folder:
   - **Windows:** `%APPDATA%\Elgato\StreamDeck\Plugins\`
   - **macOS:** `~/Library/Application Support/com.elgato.StreamDeck/Plugins/` (or run `./deploy.sh`)
4. Start the Stream Deck app — the actions appear under the **Claude Deck** category.
5. Optional: double-click `Claude.streamDeckProfile` to import a ready-made Stream Deck XL profile.

## Build from source

```powershell
npm install
npm run build      # bundles src/plugin.js -> com.technicallybrantley.claude-deck.sdPlugin/bin/plugin.mjs
npm run selftest   # exercises the usage endpoint + local data without Stream Deck
```

On macOS:

```bash
npm install
npm run build      # bundles src/plugin.js -> com.technicallybrantley.claude-deck.sdPlugin/bin/plugin.mjs
npm test           # runs the src/osa.js unit tests (node:test)
npm run selftest   # exercises the usage/session/today/burn pollers without Stream Deck
./deploy.sh        # installs to ~/Library/Application Support/com.elgato.StreamDeck/Plugins/, restarts Stream Deck
```

The plugin speaks the Stream Deck WebSocket protocol directly — the only runtime dependency is `ws`. Debug log: `claude-deck.log` inside the installed plugin folder.

## macOS permissions

Three keys drive other apps and need one-time permission grants in **System
Settings → Privacy & Security**:

| Key | Needs | Why |
|---|---|---|
| Quick Chat, Quick Prompt | **Accessibility** + **Automation → System Events** | send the global hotkey / paste keystrokes |
| Focus Session, Claude Code Terminal, Project Terminal | **Automation → Terminal** | control Terminal.app |

Grant these to the **Elgato Stream Deck** app (macOS prompts on first use — approve
whatever it names, which may include `node`/`osascript`). Until granted, those
keys flash the Stream Deck "failed" icon rather than acting. The **Quick Chat**
and **Quick Prompt** keys have a *hotkey* field in their settings — set it to
your Claude Desktop quick-entry shortcut (e.g. `option+space`). **Focus Session**
is best-effort on macOS: it matches a Terminal window by the session name or its
folder name, which may not always be present in the window title.

## How usage data works

- **Limits**: `GET https://api.anthropic.com/api/oauth/usage` authorized with the OAuth token Claude Code keeps in `~/.claude/.credentials.json`. This is the same source the `/usage` command uses. It is not a publicly documented API, so it may change; the plugin logs the raw response shape to make fixes easy.
- **Sessions**: `~/.claude/sessions/*.json`, filtered to live processes.
- **Today**: parsed from `~/.claude/projects/**/*.jsonl` transcripts (Claude Code activity only — desktop chats don't write local logs, though they do count toward the limit gauges).

## Notes

- Not affiliated with or endorsed by Anthropic. The spark icons are original artwork drawn in a similar spirit; official Anthropic/Claude logos are trademarks and are not included.
- Usage percentages are account-wide, so desktop app, claude.ai, and Claude Code usage all show up in the gauges.

## License

MIT
