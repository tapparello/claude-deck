# Privacy Policy — Agent Vitals

Last updated: 2026-07-29

**Short version: Agent Vitals sends nothing anywhere except to Anthropic's own usage
endpoint, using the sign-in you already have. There is no analytics, no telemetry, no
account, and no server operated by us.**

## What the plugin reads

All of this is on your machine and is read only to draw the keys.

| Source | Why | Leaves your machine? |
|---|---|---|
| `~/.claude/sessions/*.json` | Which Claude Code sessions are running, and whether one is waiting on you | No |
| `~/.claude/projects/**/*.jsonl` (Claude Code transcripts) | Token counts and timestamps, to compute today's activity, burn rate and estimated cost | No |
| Your Claude sign-in — macOS login Keychain (service `Claude Code-credentials`), or `~/.claude/.credentials.json` on Windows | Read the OAuth token so the usage gauges can request your subscription limits | Only as the `Authorization` header on the request below |
| `~/.claude/settings.json` | Not read by the plugin. You paste a hook entry into it yourself; Claude Code reads it. | No |

The transcripts are parsed for **usage numbers only** — token counts, model names and
timestamps. Message content is never read into the figures the keys display.

## The one network request

The usage gauges call `https://api.anthropic.com/api/oauth/usage`, roughly every two
minutes, with your OAuth token as a bearer credential. This is the same endpoint Claude
Desktop and `claude /usage` use, and it returns your own limit percentages. Nothing else
is sent, and nothing is sent anywhere else.

If that call fails, or your account has no consumer subscription (Azure AI Foundry,
Amazon Bedrock, Google Vertex), the gauges fall back to figures computed **entirely
locally** from your transcripts, and the plugin makes no network request at all.

## What the plugin writes

- **`agent-vitals.log`**, inside the installed plugin folder. Diagnostics only —
  capped at 1 MB with one rotated generation. It records tool *names* and project
  folder names for permission requests, never tool inputs (a `Write` input is an entire
  file) and never your hook secret.
- **`usage-cache.json`**, inside the installed plugin folder — the last usage reading,
  so a restart doesn't have to re-poll.
- **Stream Deck settings**, for your per-key configuration and the hook secret below.

## The permission-prompt keys, specifically

The Allow / Always Allow / Deny keys need a little more explanation because they involve
a local network listener and can act on your behalf.

- The plugin listens on **127.0.0.1 only** (loopback — not reachable from your network),
  on a port you can change.
- Access is controlled by a **32-character random secret in the URL path**, generated on
  your machine. Requests with the wrong path get a 404. The `Host` header is also
  checked. The secret is never written to the log.
- **That secret lives in plaintext in `~/.claude/settings.json`**, because that is where
  Claude Code hook configuration has to live. Treat that file as sensitive — in
  particular, do not commit it to a repository.
- Pressing a key answers a permission prompt that Claude Code is already showing. The
  plugin never invents a request, and if no Allow/Deny key is on your active page it
  answers "no decision" immediately and changes nothing.
- Requests are held for at most ~20 seconds and are dropped if the session moves on.

Anyone who obtains that secret **and** can reach your loopback interface could approve a
pending permission prompt. If you are uncomfortable with that, simply do not install the
hook — every other key works without it.

## What we do not do

- No analytics, telemetry, crash reporting or usage statistics
- No account, login or server of ours
- No advertising, and nothing sold or shared
- No reading, transmitting or storing of your conversations

## Third parties

Anthropic receives the usage request described above, under
[Anthropic's privacy policy](https://www.anthropic.com/legal/privacy). Elgato
distributes the plugin and may collect download statistics under
[Elgato's privacy policy](https://www.elgato.com/privacy). Agent Vitals is not
affiliated with or endorsed by Anthropic.

## Removing your data

Uninstalling the plugin removes its folder, log and cache. To remove the approver
configuration, delete the `PermissionRequest` hook entry from `~/.claude/settings.json`.
The plugin never stores data outside its own folder and Stream Deck's settings.

## Contact

Questions or a security concern: open an issue at
<https://github.com/tapparello/agent-vitals/issues>. For anything you would rather not
post publicly, see [SECURITY.md](SECURITY.md).
