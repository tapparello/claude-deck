// Pure decision logic for the physical approver. No I/O: every function is a
// fixture-testable transform. See docs/superpowers/specs/2026-07-25-approver-design.md §4.1.

export const DENY_MESSAGE = "Denied from Stream Deck";
export const PORT_DEFAULT = 45623;

// Claude Code may suggest six kinds of permission update. Only ONE is safe to echo
// back: adding an allow rule that names a concrete ruleContent. Clamping the
// `destination` is not enough — a `setMode` clamped to localSettings still writes
// defaultMode:"acceptEdits" into the project permanently, and an `addDirectories`
// grants a whole directory from a key that showed a filename.
export function sanitizeSuggestions(suggestions, toolName, sessionOnly = false) {
  if (!Array.isArray(suggestions)) return [];
  // MCP tools are refused outright: their suggestions are frequently whole-tool grants
  // that Claude Code's own dialog declines to offer, and an MCP server is exactly the
  // kind of thing configured with a long-lived credential — so a whole-tool grant is
  // the worst thing to hand to a single key press.
  if (String(toolName ?? "").startsWith("mcp__")) return [];
  const out = [];
  for (const e of suggestions) {
    if (!e || typeof e !== "object") continue;
    if (e.type !== "addRules" || e.behavior !== "allow") continue;
    if (!Array.isArray(e.rules)) continue;
    const rules = e.rules.filter(
      (r) => r && typeof r.toolName === "string" && r.toolName &&
             typeof r.ruleContent === "string" && r.ruleContent,
    ).map((r) => ({ toolName: r.toolName, ruleContent: r.ruleContent }));
    if (!rules.length) continue;
    // `session` is a floor we never widen; anything else becomes localSettings —
    // the project's .claude/settings.local.json, never the user-level settings file
    // (which commonly holds credentials and may be synced between machines).
    const destination = sessionOnly || e.destination === "session" ? "session" : "localSettings";
    out.push({ type: "addRules", behavior: "allow", destination, rules });
  }
  return out;
}

const wrap = (decision) => ({ hookSpecificOutput: { hookEventName: "PermissionRequest", decision } });

// The ONE suggestion this request would persist, or null when the set is empty or
// ambiguous (more than one entry, or more than one rule). Both the ALWAYS key's label
// (Task 2's alwaysRule) and its decision come from here, so a key that renders
// "ALWAYS n/a" is structurally incapable of writing anything.
export function oneSafeRule(req, sessionOnly = false) {
  const safe = sanitizeSuggestions(req?.suggestions, req?.toolName, sessionOnly);
  if (safe.length !== 1 || safe[0].rules.length !== 1) return null;
  return safe[0];
}

export function decisionBody(kind, req, opts = {}) {
  if (kind === "allow") return wrap({ behavior: "allow" });
  if (kind === "deny") return wrap({ behavior: "deny", message: DENY_MESSAGE });
  if (kind !== "always") return null;
  const entry = oneSafeRule(req, !!opts.sessionOnly);
  // No single safe rule => no decision at all. A bare allow here would silently turn
  // ALWAYS into ALLOW, and passing the whole `safe` array through would let a key that
  // rendered "ALWAYS n/a" persist several rules.
  if (!entry) return null;
  return wrap({ behavior: "allow", updatedPermissions: [entry] });
}

export const NAME_MAX = 11;    // matches the existing statusKey name limit
export const TARGET_MAX = 14;
export const RULE_MAX = 18;    // single-line/two-line split threshold for the ALWAYS key (src/plugin.js)
export const RULE_FIT = 36;    // legibility ceiling: past this, alwaysRule() refuses rather than truncates

// Collapse whitespace AND control characters. Applied to every branch, not just
// Bash: a WebSearch query or an mcp tool name can carry newlines too.
const clean = (v) => String(v ?? "").replace(/[\s\p{Cc}]+/gu, " ").trim();
const cut = (s, max) => (s.length > max ? s.slice(0, max - 1) + "…" : s);
const base = (p) => clean(p).split(/[\\/]/).filter(Boolean).pop() ?? "";

function targetOf(req) {
  const t = req?.toolName ?? "";
  const i = req?.toolInput;
  const has = i && typeof i === "object";
  if (t === "Bash" && has && i.command) return clean(i.command);
  if (["Edit", "Write", "NotebookEdit", "Read"].includes(t) && has && i.file_path) return base(i.file_path);
  if (t === "WebFetch" && has && i.url) {
    try { return clean(new URL(String(i.url)).hostname); } catch { return clean(t); }
  }
  if (t === "WebSearch" && has && i.query) return clean(i.query);
  if (t === "Task" && has && i.subagent_type) return clean(i.subagent_type);
  if (t.startsWith("mcp__")) {
    const [, server, ...rest] = t.split("__");
    if (server && rest.length) return clean(`${server}·${rest.join("__")}`);
  }
  return clean(t);
}

export function describeRequest(req) {
  return {
    name: cut(base(req?.cwd), NAME_MAX),
    target: cut(targetOf(req), TARGET_MAX),
  };
}

// The rule TEXT, because Claude Code's own suggestions are wildcards:
// `gh pr merge --admin 1234` suggests `Bash(gh pr *)`. Showing the command would
// misrepresent what the press persists. null => the ALWAYS key renders disabled, and
// because decisionBody uses the SAME oneSafeRule, it also refuses.
//
// Returned WHOLE, never truncated: `WebFetch(` + `domain:` is already 16 characters,
// so truncating at RULE_MAX (18) made every WebFetch domain grant paint as
// "WebFetch(domain:e…" — two different domains rendered IDENTICALLY on the one key
// that produces a durable write. src/plugin.js splits anything over RULE_MAX across
// two lines instead. Only past RULE_FIT (36, the point past which even two lines
// can't show it legibly) does this return null — a rule too long to show honestly
// must not be pressable, rather than silently hiding the part that matters.
export function alwaysRule(req, sessionOnly = false) {
  const entry = oneSafeRule(req, sessionOnly);
  if (!entry) return null;
  const { toolName, ruleContent } = entry.rules[0];
  const text = clean(`${toolName}(${ruleContent})`);
  return text.length > RULE_FIT ? null : text;
}

// A DENY is followed almost immediately by Claude retrying the SAME call. Measured
// on-device 2026-07-28: deny at 15:24:06.653, retry with identical input at
// 15:24:08.447 — 1.8s later. The retry is a new request that paints an identical key,
// so an ALWAYS press meant for the NEXT prompt lands on the retry and writes a durable
// allow rule for the call just refused. That is exactly what happened on the first real
// run: a denied curl.se became WebFetch(domain:curl.se) in settings.local.json.
//
// Keyed on the RULE the press would persist rather than on the command, because the
// rule is what re-permits the denied call: `gh pr merge --admin 1` and `gh pr list`
// share the rule `Bash(gh pr *)`, so allowing that rule after denying either one
// re-permits both. sessionOnly is not passed: it changes only a suggestion's
// `destination`, never the rule text, so it cannot affect identity.
export const DENY_WINDOW_MS = 30_000;

export const pruneDenies = (denies, now) =>
  (denies ?? []).filter((d) => now - d.at < DENY_WINDOW_MS);

export function rememberDeny(denies, req, now) {
  const rule = alwaysRule(req);
  const kept = pruneDenies(denies, now).filter((d) => d.rule !== rule);
  return rule ? [...kept, { rule, at: now }] : kept;
}

// null => nothing recently denied covers this request. A non-null result is BOTH the
// reason the ALWAYS key renders disabled and the reason a press is refused, so the two
// can never disagree. Returns null when there is no persistable rule: `oneSafeRule`
// already refuses those, and "just denied" would mislabel why the key is dark.
export function denyBlock(denies, req, now) {
  const rule = alwaysRule(req);
  if (!rule) return null;
  return (denies ?? []).some((d) => d.rule === rule && now - d.at < DENY_WINDOW_MS)
    ? "just denied"
    : null;
}

export const QUEUE_MAX = 8;
export const HOLD_S_DEFAULT = 20;
export const YOUNG_MS = 10_000;

export function enqueue(queue, req) {
  const next = [...queue, req];
  // Evict the OLDEST rather than refusing the newest: otherwise eight requests
  // already answered in the terminal would disable the approver for a whole hold
  // window, with a full depth badge that looks identical to "busy".
  if (next.length <= QUEUE_MAX) return { queue: next, evicted: null };
  const [evicted, ...rest] = next;
  return { queue: rest, evicted };
}

// The copyable install fragment. Pure JSON text: NO comments, because the user pastes
// this straight into ~/.claude/settings.json, and JSON has no comment syntax. The
// human-readable merge instructions live in the Property Inspector note instead.
export function hookFragment(url, timeoutS) {
  return [
    '"PermissionRequest": [',
    '  {',
    '    "matcher": "",',
    '    "hooks": [',
    '      {',
    '        "type": "http",',
    `        "url": ${JSON.stringify(url)},`,
    `        "timeout": ${Number(timeoutS)}`,
    "      }",
    "    ]",
    "  }",
    "]",
  ].join("\n");
}

export const head = (queue) => queue[0] ?? null;

export function resolve(queue, id) {
  const req = queue.find((r) => r.id === id) ?? null;
  return { queue: req ? queue.filter((r) => r.id !== id) : queue, req };
}

export const expiredIds = (queue, now, holdMs) =>
  queue.filter((r) => now - r.receivedAt > holdMs).map((r) => r.id);

// Record each new request's baseline from the first poll that OBSERVES it. Snapshotting
// at enqueue would capture a <=5s-stale cache that predates the status flip which
// caused the prompt, and every request would then look stale forever.
export function seedBaselines(queue, sessions, activity) {
  if (!queue.some((r) => !r.baselined)) return queue;
  return queue.map((r) => {
    if (r.baselined) return r;
    const matches = (sessions ?? []).filter((s) => s.sessionId === r.sessionId);
    const s = matches.slice().sort((a, b) => (b.statusUpdatedAt ?? 0) - (a.statusUpdatedAt ?? 0))[0] ?? null;
    return {
      ...r,
      statusSnapshot: s?.statusUpdatedAt ?? null,
      activitySnapshot: activity?.get?.(r.sessionId) ?? null,
      baselined: true,
    };
  });
}

// Request-scoped staleness. "The session left status:waiting" is NOT usable here:
// VS Code sessions write no status at all, two live pids can share one sessionId
// after a resume, and a waiting->busy->waiting flip inside one turn is often
// shorter than the 5s poll. So compare per-request snapshots instead, and bias
// towards keeping when we cannot tell — a false keep costs a stale key, while a
// false drop would silently remove a live request from the deck.
export function staleIds(queue, sessions, activity, now) {
  const out = [];
  for (const r of queue) {
    if (!r.baselined) continue; // no observed baseline yet -> nothing to compare against
    if (now - r.receivedAt < YOUNG_MS) continue;
    const matches = (sessions ?? []).filter((s) => s.sessionId === r.sessionId);
    if (!matches.length) continue; // invisible !== answered
    // Two live pids can share one sessionId after a resume: prefer the most recently
    // updated record. Only statusUpdatedAt is read below, so a tie there would compare
    // equal either way — there is nothing left to break the tie WITH.
    const s = matches.slice().sort((a, b) => (b.statusUpdatedAt ?? 0) - (a.statusUpdatedAt ?? 0))[0];
    if (s.statusUpdatedAt != null && r.statusSnapshot != null && s.statusUpdatedAt > r.statusSnapshot) {
      out.push(r.id);
      continue;
    }
    const mt = activity?.get?.(r.sessionId) ?? null;
    if (mt != null && r.activitySnapshot != null && mt > r.activitySnapshot) out.push(r.id);
  }
  return out;
}

export const SETTLE_MS = 500;

// A press must answer the request the key was DISPLAYING, never merely whatever sits
// at head when the keyDown arrives - those differ whenever a drop, eviction or new
// request lands between paint and press.
export function pressDecision({ queue, shownId, lastHeadChangeAt, now, settleMs = SETTLE_MS }) {
  const h = head(queue);
  if (!h) return { action: "none", reason: "empty" };
  if (now - lastHeadChangeAt < settleMs) return { action: "none", reason: "settling" };
  if (h.id !== shownId) return { action: "alert", reason: "stale-paint" };
  return { action: "resolve", id: h.id, reason: "ok" };
}
