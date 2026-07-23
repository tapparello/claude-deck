# Handoff notes for future agents

This file is for whoever (human or agent) next touches this repo. The
README is the user-facing doc; this is the "what you'd otherwise have to
rediscover" doc. Keep it updated when you learn something the hard way.

## Repo shape

- `src/plugin.js` — the actual source. Edit this, never the bundle.
- `com.technicallybrantley.claude-deck.sdPlugin/bin/plugin.mjs` — esbuild
  output, checked in because Stream Deck loads directly from the installed
  plugin folder. Regenerate with `npm run build`; don't hand-edit it.
- `com.technicallybrantley.claude-deck.sdPlugin/manifest.json` — action
  definitions Stream Deck reads. Bump `"Version"` (4-part, e.g. `1.0.1.0`)
  on any behavior change so old cached state doesn't get confused with new.
- `deploy.ps1` — stops Stream Deck, replaces the installed plugin folder
  with a fresh copy of `com.technicallybrantley.claude-deck.sdPlugin/`,
  restarts it. This is Windows-only (PowerShell) — use the `PowerShell`
  tool, not `Bash`, to run it.
- `docs/*.png` — README screenshots. `local-assets/claude-logo.png` is
  gitignored (personal-use icon override); `deploy.ps1` copies it over the
  SVG launcher/category icons if present.

## Build → deploy → verify loop

```powershell
npm run build       # src/plugin.js -> bin/plugin.mjs
npm run selftest     # runs the plugin's poll functions headless, prints results
.\deploy.ps1          # installs to %APPDATA%\Elgato\...\Plugins\, restarts Stream Deck
```

`selftest` is the fast feedback loop — it calls `pollUsage`/`pollToday`/
`pollBurn` directly and dumps JSON, no physical Stream Deck needed. Always
run it before `deploy.ps1` to catch logic errors without a restart cycle.
The usage-limit endpoint selftest checks can 429 if you just hit it (client
backs off 240s) — that's expected, not a bug.

Debug log at runtime: `%APPDATA%\Elgato\StreamDeck\Plugins\<plugin>\claude-deck.log`.

## The transcript-line dedup gotcha (fixed 2026-07-17/18, commit `ea27c2c`)

This is the thing most likely to bite you again if you touch `pollToday()`
or `pollBurn()` (or add a new poller that reads `~/.claude/projects/**/*.jsonl`):

**One assistant turn writes multiple lines to the transcript.** When a
response streams tool calls, Claude Code appends a new JSONL line per
content block (thinking, then each tool_use) as it arrives — and **every
line repeats that request's full cumulative `usage` object**, not a
per-block increment. So a response with a thinking block + 6 tool calls
writes 7 lines, all carrying identical `usage.output_tokens` /
`cache_read_input_tokens` / etc., all sharing one `requestId`.

Summing `usage` across every line — which is what both pollers originally
did — overcounts by however many content blocks each response had. On a
real session this inflated the displayed total by ~2.5x (804M raw vs 321M
actual on the day this was caught; verified against `ccusage`, which
dedupes correctly, and against the account's real rate-limit meters).

**The fix, and the invariant to preserve:** dedupe by `message.id` (fall
back to `j.requestId` if absent) and take the max usage seen per id, not
the sum. `pollToday()` does this with a `reqTok` Map per file; `pollBurn()`
does it with `rec.seen` Map alongside its event list (needed because it's
an incremental tail-reader across ticks, not a one-shot file scan — a
later snapshot of the same request can revise the totals, so it updates
the existing event in place rather than pushing a new one).

If you write a new feature that reads these transcripts, assume every
`type: "assistant"` line needs this same dedup — it is not specific to
today/burn, it's a property of the log format.

## Usage-limit gauges vs. local transcript data — two different sources

- Session/Weekly/Model gauges hit `GET
  https://api.anthropic.com/api/oauth/usage` (undocumented, OAuth token
  from `~/.claude/.credentials.json`) — this is server-computed truth, same
  numbers `/usage` shows in Claude Code. Trust these over anything derived
  from local files.
- Today/Burn Rate are computed locally from `~/.claude/projects/**/*.jsonl`
  transcripts. This only sees Claude Code activity on **this machine** — it
  undercounts relative to the account-wide gauges above if the user also
  uses Claude Desktop, claude.ai, or Claude Code on another device. That's
  expected and already noted in the README; don't "fix" Today to match the
  gauges by inflating it — the discrepancy is real and directional, not a bug.

## macOS support (added 2026-07)

- Cross-platform from one bundle. `src/plugin.js` selects a platform adapter at
  load (`IS_MAC = process.platform === "darwin"`): `winPlatform` holds the
  original PowerShell/`cmd`/`wt` commands verbatim; `macPlatform` uses
  `open` / `osascript` / `pbcopy` / `security`. Change platform behavior in the
  adapter, not in `onKeyDown`.
- Pure, testable helpers live in `src/osa.js` (hotkey parsing, AppleScript
  escaping, custom-command classification, Keychain-JSON parsing) with
  `node:test` unit tests in `test/osa.test.js`. Run `npm test`.
- Deploy on macOS with `./deploy.sh` (bash sibling of `deploy.ps1`); target is
  `~/Library/Application Support/com.elgato.StreamDeck/Plugins/`.
- **Credentials differ by OS:** `readToken()` reads `~/.claude/.credentials.json`
  on Windows and the login **Keychain** (`security -s "Claude Code-credentials"`)
  on macOS, file as fallback. On a Foundry/enterprise Mac there is no consumer
  token, so the gauges read **n/a** by design — do not "fix" that.
- **Permissions:** Quick Chat / Quick Prompt need Accessibility + Automation
  (System Events); the Claude Code Terminal / Project Terminal keys need
  Automation (Terminal). **Focus Session** resolves the session's host app by
  PID (`ps -axo pid=,ppid=,comm=` walked to the outermost `.app` bundle via
  `hostAppForPid`/`parsePsTree`), then tries to raise the *exact window*
  per-app (`focusStrategyForBundle` in `src/osa.js` picks the strategy):
  Terminal.app matches the session's controlling tty (`ps -o tty=`) against
  each window's tabs (needs Automation → Terminal); VS Code matches the
  session's cwd folder name against each window's title via System Events
  (needs Accessibility) — fragile by nature. Any other app just gets
  activated. On no match / missing permission / timeout / no tty, it falls
  back to `open`ing the host bundle (plain app-activation), so the key
  degrades gracefully instead of doing nothing. Every `osascript` call is
  time-bounded (`OSA_TIMEOUT_MS` + AppleScript `with timeout`) so a pending
  TCC prompt can't hang a key.
- **Deferred:** a Foundry-friendly local token/cost usage key (from
  `~/.claude/usage-data/` or transcript aggregation) — its own plan.

## Git push quirk observed on this box

`git push` from an agent's non-interactive shell has hung here before,
apparently because Git Credential Manager wanted to do an interactive
device-login flow and had nothing to prompt against. It resolved itself on
a later attempt without any local config change (credential likely got
refreshed/cached from an interactive login elsewhere in the meantime). If
`git push` hangs: don't fight it with GCM env vars, just retry later, or
ask the user to run it themselves (they can do so live via the `!`-prefixed
command passthrough in Claude Code).

## Things NOT to do

- Don't hand-edit `bin/plugin.mjs` — it's regenerated and your edit will
  silently vanish on the next `npm run build`.
- Don't commit `usage-cache.json` or anything under `local-assets/` (both
  gitignored on purpose — cache is machine-local runtime state, the logo is
  a personal-use asset not licensed for redistribution in this OSS repo).
- Don't assume transcript line count == message count. See dedup section above.
