# Security Policy — Agent Vitals

## Reporting a vulnerability

Please use GitHub's private reporting rather than a public issue:
**[Report a vulnerability](https://github.com/tapparello/agent-vitals/security/advisories/new)**.

If that is unavailable, open a normal issue saying only that you have a security report
and how to reach you — no details in the public thread.

This is a personal project with one maintainer, so please don't expect a same-day reply.
I'll acknowledge within a week and tell you what I plan to do.

## Scope worth looking at

Most of the plugin only reads local files and draws pictures. Two areas carry real risk
and are the interesting targets:

**The permission-prompt listener** (`src/hookserver.js`). A loopback HTTP server whose
capability is a 32-character secret in the URL path. It can approve a Claude Code
permission request, so a bypass matters. Known and intended properties:

- Binds `127.0.0.1` only, never a routable interface
- Exact path match with `timingSafeEqual`; anything else is a 404
- `Host` header must be `127.0.0.1:<port>` or `localhost:<port>`
- 1 MB body cap; responses are idempotent; a dropped socket dequeues the request
- The secret is never logged — the startup line prints a literal `<secret>` placeholder

Genuinely interesting findings here would be: recovering the secret from anywhere on
disk or from the log, answering a request the deck never displayed, or getting the server
to accept a cross-origin or non-loopback request.

**The approval guards** (`src/approve.js`). A press must never answer something you
didn't see. There is a settle window after the queue head changes, the painted request id
and rule are compared against what the key actually drew, and `Always Allow` refuses when
no single safe rule is on offer, for every MCP tool, and for 30 seconds after a related
deny. A way around any of those is a real bug.

## Out of scope

- The plaintext hook secret in `~/.claude/settings.json`. That is inherent to where
  Claude Code hook configuration lives, and it is documented in
  [PRIVACY.md](PRIVACY.md). Local file permissions are the boundary there.
- Anything requiring an attacker to already have code execution as your user.
- The undocumented Anthropic usage endpoint changing or disappearing. That is an
  availability risk, not a vulnerability; the plugin degrades to local-only figures.
- Cost figures being inexact. They are explicitly labelled estimates.

## Supported versions

The latest release only. This is a single-maintainer project with no backport branches.
