# Handoff notes for future agents

This file is for whoever (human or agent) next touches this repo. The
README is the user-facing doc; this is the "what you'd otherwise have to
rediscover" doc. Keep it updated when you learn something the hard way.

## Repo shape

- `src/plugin.js` — the actual source. Edit this, never the bundle.
- `src/keyart.js` — every key's SVG, and the whole design system. Pure functions of
  their arguments, which is what lets `tools/gen-showcase.mjs` render the entire deck
  outside the plugin. Read the header comment before changing anything visual: the three
  rules there are each backed by a measurement, and two of them exist because the
  obvious-looking alternative was tried and broke something. `localGauge()` deliberately
  stayed in `plugin.js` — it reads the `animPhase` ticker, so it is not pure.
- `src/approve.js` — pure decision logic for the approver (rule sanitising, key text,
  queue, press and deny-window guards). No I/O, so every rule is fixture-testable.
- `src/hookserver.js` — the loopback listener the `PermissionRequest` hook POSTs to.
  Owns the capability URL, idempotent responses and dropped-socket detection.
- `Claude.streamDeckProfile` — a zip of a `.sdProfile` directory, imported by
  double-clicking. **Re-export it whenever you add an action**, or importers get a
  layout missing the new keys: the approver keys were absent from it for 20 commits
  because nothing in this file said to. Rebuild by zipping the live profile directory
  from `~/Library/Application Support/com.elgato.StreamDeck/ProfilesV3/<uuid>.sdProfile`
  (keep that directory as the zip's top-level entry) and strip any per-key settings that
  differ from the documented defaults — a ticked `sessionOnly` would otherwise ship a
  different write scope than the README promises.
- `dev.tapparello.claude-deck.sdPlugin/bin/plugin.mjs` — esbuild
  output, checked in because Stream Deck loads directly from the installed
  plugin folder. Regenerate with `npm run build`; don't hand-edit it.
- `dev.tapparello.claude-deck.sdPlugin/manifest.json` — action
  definitions Stream Deck reads. Bump `"Version"` (4-part, e.g. `1.0.1.0`)
  on any behavior change so old cached state doesn't get confused with new.
- `deploy.ps1` — stops Stream Deck, replaces the installed plugin folder
  with a fresh copy of `dev.tapparello.claude-deck.sdPlugin/`,
  restarts it. This is Windows-only (PowerShell) — use the `PowerShell`
  tool, not `Bash`, to run it.
- `deploy.sh` — the macOS equivalent, same three steps against
  `~/Library/Application Support/com.elgato.StreamDeck/Plugins/`. Takes
  `--no-restart`. **Its relaunch is not reliable:** it has been observed to leave
  Stream Deck quit, which also leaves the approver's hook server down, so the keys go
  dead and Claude Code gets `ECONNREFUSED`. Check `pgrep -x "Stream Deck"` after
  deploying and run `open -a "Elgato Stream Deck"` if it is not up.
- `tools/gen-icons.mjs` (`npm run icons`) — writes all 21 action-list icons from the
  same glyph table the keys use. Never hand-edit `imgs/*.svg`: they had drifted to FOUR
  different backgrounds and their own art before this existed. The script refuses to run
  if a file on disk has no mapping, so a new action can't silently keep a stale icon.
- `tools/gen-showcase.mjs` (`npm run showcase`) — writes `docs/keys.svg` and
  `docs/actions.svg` from the real renderers, for the README. Regenerate after ANY
  visual change; the previous README shots outlived the design they documented by a
  whole redesign. `docs/*.png` are raster snapshots of those SVGs for hosts that won't
  render SVG — refresh them by opening the SVG in a browser at natural size and
  screenshotting, since there is no rasteriser in the toolchain.
- `local-assets/claude-logo.png` is gitignored (personal-use icon override); both deploy
  scripts copy it over the launcher/category icons if present. **It no longer reaches the
  launch KEY:** `launch` now has a renderer, so `setImage` overwrites whatever art the
  manifest points at. The category icon still honours it.

## Build → deploy → verify loop

```powershell
npm test            # 185 unit tests, no Stream Deck and no network needed
npm run build       # src/plugin.js -> bin/plugin.mjs
npm run selftest     # runs the plugin's poll functions headless, prints results
.\deploy.ps1          # installs to %APPDATA%\Elgato\...\Plugins\, restarts Stream Deck
```

```bash
npm test && npm run build && npm run selftest && ./deploy.sh   # macOS
```

`selftest` is the fast feedback loop — it calls `pollUsage`/`pollToday`/
`pollBurn` directly and dumps JSON, no physical Stream Deck needed. It also boots the
hook server and round-trips one request through it, which is the only end-to-end check
of the approver that needs no deck. Always run it before deploying to catch logic errors
without a restart cycle. The usage-limit endpoint selftest checks can 429 if you just
hit it (client backs off 240s) — that's expected, not a bug.

Debug log at runtime, next to the installed plugin: `claude-deck.log` in
`%APPDATA%\Elgato\StreamDeck\Plugins\<plugin>\` or
`~/Library/Application Support/com.elgato.StreamDeck/Plugins/<plugin>/`. It never
contains the hook secret — the startup line prints a literal `<secret>` placeholder, so
don't try to read the live URL out of it (compare by probing the endpoint instead).

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
- **Superseded (2026-07-25):** the notes below once said the Foundry gauges read `n/a` **by design** and must not be "fixed", and that the Foundry answer shipped as a separate key. Both are now **out of date**. `Session 5h` / `Weekly` / `Model Usage` fall back to local transcript spend via `gaugeSource()` in `src/usage.js` — a state machine (`pending | subscription | throttled | local | error`), NOT a presence check, because `pollUsage` sets `usageErr` but never clears `state.usage` and `usageAt` only advances on success, so a stale snapshot would otherwise read as live. Optional per-key `budget` (dollars) turns a fallback key into a % ring; `gaugeKey` clamps the drawn bar at 100%, so an overage is carried in the sub-line. Don't "restore" the n/a behaviour.
- **Credentials differ by OS:** `readToken()` reads `~/.claude/.credentials.json`
  on Windows and the login **Keychain** (`security -s "Claude Code-credentials"`)
  on macOS, file as fallback. On a Foundry/enterprise Mac there is no consumer
  token, so the gauges fall back to local spend (see the superseded note above).
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
- **Done:** the Foundry-friendly local usage story shipped twice — first as the
  `usage-meter` ("Usage") key, then as the gauge fallback described above.

## Git push quirk observed on this box

`git push` from an agent's non-interactive shell has hung here before,
apparently because Git Credential Manager wanted to do an interactive
device-login flow and had nothing to prompt against. It resolved itself on
a later attempt without any local config change (credential likely got
refreshed/cached from an interactive login elsewhere in the meantime). If
`git push` hangs: don't fight it with GCM env vars, just retry later, or
ask the user to run it themselves (they can do so live via the `!`-prefixed
command passthrough in Claude Code).

## Usage key + recursive transcript walk (added 2026-07)

- `src/usage.js` — pure helpers (`windowStartMs`, `rateFor`/`estimateCost`,
  `parseRequests`, `mergeById`, `aggregate`) with `node:test` tests in
  `test/usage.test.js`. Cost is an **estimate** from a standard per-model rate
  table (family-prefix match); always shown with an `est` marker.
- `walkTranscripts(dir, cutoffMs)` in `plugin.js` walks `~/.claude/projects`
  **recursively** (incl. `<uuid>/subagents/`). `pollToday`/`pollBurn` were
  switched to it — they previously scanned one level and undercounted subagent
  usage by ~half. Their numbers are correspondingly higher now (a fix, not a
  regression).
- `pollUsageMeter()` builds one globally-deduped request set (max per
  `message.id`) and aggregates per window; it's gated on ≥1 visible `usage-meter`
  key and scans only the earliest window in use. Per-file cache keyed by
  `(size, mtime)`.
- The `usage-meter` action is cross-platform (pure data) and needs no
  permissions.
- Note: `pollToday` dedups token totals **per file**, while `pollUsageMeter` dedups **globally** (`mergeById`). If one `message.id` appears in multiple transcripts (forked/resumed sessions), the Today key can read slightly higher than a "today" Usage key. The Usage key's global dedup is the more accurate; the difference is usually nil (ids are unique per file).
- Cost rates are user-overridable via **Stream Deck global settings** (`{rates:{opus:{in,out},…}}`), edited in the Usage key's Property Inspector (a grid bound to `getGlobalSettings`/`setGlobalSettings`, not the per-key `setSettings`). The plugin loads them on `getGlobalSettings` at register + every `didReceiveGlobalSettings` into `state.rates`, threaded into `aggregate`→`estimateCost`→`rateFor` (family-prefix, blank→default via `validNum`+`??`; `0` is a valid free rate). Cache multipliers (0.1×/1.25×) are not configurable; the `est` marker stays. Note: `Version` stays `1.2.0.0` — rates fold into that still-unshipped version, so the standing "bump Version on behavior change" rule doesn't apply here.

## Claude Status key (added 2026-07)

- `src/status.js` — pure resolver for the **Claude Status** key (`resolveStatusKey`/`statusEntry`/`autoOrdinal`). Status shares the existing `pollSessions` source of truth (session `status` + pid liveness), keyed on `sessionId`, bound by project-folder name (or auto).

## Session status enum — the thing to know (verified 2.1.219)

`~/.claude/sessions/<pid>.json` carries **`status` ∈ `busy` | `shell` | `idle` | `waiting`**, plus **`waitingFor`** (`permission prompt` | `input needed` | `dialog open` | `sandbox request` | `worker request`) and **`statusUpdatedAt`**. `waiting` means **Claude is blocked on the human**.

- `sessionState()` in `src/status.js` maps these to `needs-approval` / `input-needed` / `working` / `finished` / `idle`. **Don't reintroduce `status !== "idle"` as "working"** — that was a real bug: a session sitting on a permission prompt rendered as blue "Working" and counted in the Sessions key's "N working" with the dots animating.
- `blockedSessions()` returns **full poller records** on purpose: `platform.focusWindow` rejects without `s.pid`.
- `pollSessions`' change-signature includes the derived state, so time-relative transitions (Finished → Idle at 60s) repaint. Without that, `[pid,status]` alone never changes and the key goes stale.
- **`entrypoint` matters.** Only `entrypoint: "cli"` sessions carry `status`/`waitingFor`/`statusUpdatedAt`; **`entrypoint: "claude-vscode"` sessions write none of them** (verified — the extension never calls the status writer). For status-less sessions `sessionState()` falls back to the transcript mtime (`transcriptPathFor()` → `<projects>/<cwd with / and _ → ->/<sessionId>.jsonl`), injected as a `Map` so `status.js` stays pure: fresh write → `working`, stale → `idle`, no transcript → `unknown` ("no status"). A real status **always** wins. Don't "simplify" a status-less session to `idle` — that reports Idle for a VS Code session that is mid-turn.
- This is **~6s faster than the `Notification` hook** (which waits out a user-idle debounce) and needs no hooks at all — that's why **Claude Status** stays hook-free even now that a separate hook-based approver exists (see below). **Superseded (2026-07-25):** this note used to say a hook-based approver (Allow/Deny keys) was designed and rejected as unsafe, citing four disqualifiers (fail-closed on hook timeout, `ask` rules re-prompting over a hook `allow`, Bash splitting compound commands, subagents sharing `session_id`). That verdict didn't hold up — see **Approver (v1.7.0.0)** below for the shipped design. It doesn't eliminate all four so much as make them survivable: the snippet's declared hook `timeout` is padded past the plugin's own 20s hold (`HOLD_S + TIMEOUT_PAD_S`, see `installSnippet()`/`TIMEOUT_PAD_S` in `src/plugin.js`) so the plugin's answer — which can land up to `HOLD_MS + 600ms` after the request arrived — reaches Claude Code before its declared timeout expires, rather than losing that race and letting the call hang; `oneSafeRule` refuses to guess at a single rule for anything but an unambiguous single-rule suggestion; and either channel (deck or terminal) can answer first with no coordination needed — so a double-answer or a mismatched match is a no-op, not a hazard.

## Approver (v1.7.0.0)

- **`sanitizeSuggestions` (`src/approve.js`) is a security boundary.** It whitelists
  `type:"addRules"` + `behavior:"allow"` + a non-empty `ruleContent`, and clamps
  `destination` to `localSettings`/`session`. Clamping the destination alone is NOT
  enough: `setMode` would persist `defaultMode:"acceptEdits"`, `addDirectories` would
  grant a whole directory. A test asserts no input can emit a forbidden type or
  destination — do not weaken it.
- **The hook consumer in Claude Code skips the over-broad-rule filter** that its TUI,
  bridge and SDK all apply, and the payload does not carry the `showAlwaysAllow`
  signals. That is why we drop rules with no `ruleContent` and refuse `mcp__*`.
- **A press answers `shownReq.get(context)`, not `head(queue)`.** They differ whenever a
  drop or new request lands between paint and press.
- **Staleness is request-scoped** (`statusUpdatedAt`/transcript-mtime snapshots), never
  "the session left `waiting`": VS Code sessions write no `status`, and two live pids can
  share one `sessionId` after a resume.
- The secret lives in **Stream Deck global settings**, not `PLUGIN_DIR` — `deploy.sh`
  does `rm -rf "$DST"` and would wipe it. Merge global settings, never clobber (`rates`
  lives there too), and **never regenerate over a secret already in `state.hookSecret`**
  or the URL the user pasted stops working silently.
- **`oneSafeRule` is the single source of truth for ALWAYS.** The key's label and its
  decision both derive from it, so a key rendering `ALWAYS n/a` is structurally unable to
  write anything. Do not give `decisionBody` its own, looser check.
- **A DENY blocks ALWAYS for the same rule for 30 s** (`DENY_WINDOW_MS`, found on-device
  2026-07-28). Claude retries a denied call with identical input ~1.8 s later (measured:
  deny 15:24:06.653 → retry 15:24:08.447), and the retry paints an identical key — on the
  first real run this turned a *denied* `curl.se` into `WebFetch(domain:curl.se)` in
  `settings.local.json`. `state.denies` holds `{rule, at}`, keyed on the **rule** rather
  than the command, because the rule is what re-permits the denied call (`gh pr list` and
  `gh pr merge --admin 1` share `Bash(gh pr *)`). The renderer and the press handler call
  the same `denyBlock()`, so a key that paints `just denied` is exactly the key that
  refuses; the block is pruned in the session poll so it visibly lifts.
- **Staleness baselines are seeded on first observation, not at enqueue.** `state.sessions`
  is up to 5 s stale, and the status flip that causes a prompt lands ~simultaneously with
  the hook POST — snapshotting at enqueue makes every request look stale and cuts the real
  hold to 10-15 s.
- **Socket tests must carry `{ timeout: … }`.** `node --test` has no default bound, so a
  test that awaits a held response hangs CI for hours instead of failing.
- **`alwaysRule()` returns the rule TEXT WHOLE, never truncated** (fixed 2026-07-25).
  Truncating at 18 chars used to collapse every WebFetch domain grant to the identical
  `"WebFetch(domain:e…"` — two different domains rendered the same on the one key that
  produces a durable write. It now returns `null` (the existing disabled `ALWAYS n/a`
  path) only past `RULE_FIT` (36). `keyart.js`'s `ruleLines()` breaks the rest across up
  to four lines, measuring each one, so there is no character threshold any more —
  `RULE_MAX` is gone. **The two-line split it replaced did not actually fit:**
  `(domain:docs.amplify.aws)` rendered 199 units wide inside a 144 box, clipped on BOTH
  sides, so the fix for identical-looking domains shipped a second bug that looked the
  same from the deck. Measure text, don't eyeball it — `test/keyart.test.js` now asserts
  every string in every key state stays inside the box.
- **Key art bugs are invisible until you measure or zoom** (learned 2026-07-28). Three
  shipped or nearly shipped in one session, all of them looking fine in a normal-size
  render: text 199 units wide in a 144 box (clipped both sides, so two domains looked
  identical); a header running into its own corner marker so `THIS MONTH` + `est` read as
  `THIS MONTHest`; and a full-width band at `y=0` painting straight over the key's
  `rx="18"`, squaring off the top corners of every action key *and* DENY. `fit()` alone
  never fixes overflow — it stops shrinking at a floor, so `line()` shrinks *then*
  truncates and every string goes through it. `test/keyart.test.js` covers all three
  classes: box overflow, same-baseline collision, and square-cornered top fills. Add to
  it rather than trusting a screenshot.
- **Colour in this plugin is a scarce resource** (2026-07-28). Five hues are spent on
  state and three on the approve decisions; there is no room for a decorative accent, and
  the old Claude orange measured within 1.13:1 of the alarm red. Action-key identity works
  only because it uses *chroma* (~20 vs the state palette's 49-92) and a different
  position on the key. Before adding any colour, check it against every entry in `C` — the
  first attempt at identity hues coloured the band BY state, which made a working FOCUS
  key indistinguishable from the ALWAYS key sitting next to it in the shipped profile.
- **The `auth?` signal is windowed, not cumulative** (fixed 2026-07-25).
  `hookserver.js`'s `stats.badPathHits` is a pruned array of recent wrong-path
  timestamps, cleared outright the moment a correctly-pathed request arrives — a single
  stray 404 (any web page can trigger one with a no-cors POST to the port) must not
  latch the key red for the life of the process. `authFlagged()` in `plugin.js`
  re-filters by `BADPATH_WINDOW_MS` at read time too, so the flag also decays if no
  further bad requests ever arrive to prune it.
- **`ensureHookServerOnce`'s rebind check compares the bound SECRET too, not just the
  port** (fixed 2026-07-25). `startHookServer`'s resolved handle now exposes `secret`;
  without that, global settings handing back a different valid secret would overwrite
  `state.hookSecret` while the old server kept listening on the old path forever —
  unrecoverable without a restart. `ensureHookServer()` also now queues one trailing
  re-run if a call arrives while another is in flight, instead of dropping it.

## Things NOT to do

- Don't hand-edit `bin/plugin.mjs` — it's regenerated and your edit will
  silently vanish on the next `npm run build`.
- Don't commit `usage-cache.json` or anything under `local-assets/` (both
  gitignored on purpose — cache is machine-local runtime state, the logo is
  a personal-use asset not licensed for redistribution in this OSS repo).
- Don't assume transcript line count == message count. See dedup section above.
