// Pure resolver for the per-session "Claude Status" key.
// No I/O — operates on the session objects produced by pollSessions().
import path from "node:path";

// Claude Code (verified 2.1.219) writes per-session status into
// ~/.claude/sessions/<pid>.json:
//   status     ∈ busy | shell | idle | waiting
//   waitingFor ∈ permission prompt | input needed | dialog open |
//                sandbox request | worker request   (only when status=waiting)
//   statusUpdatedAt — stamped on every status transition
// "waiting" means Claude is blocked on the human — treating it as "working"
// (which this file used to do) reports the opposite of the truth.
// Only these read as "Claude is asking you a question"; everything else that is
// waiting (including a missing or unrecognized waitingFor) reads as an approval
// request — matching Claude Code's own fallback, which defaults an unmapped
// dialog kind to "permission prompt". One policy for both kinds of ignorance.
const QUESTION_WAITS = new Set(["input needed", "dialog open"]);
export const FINISHED_MS = 60_000;
// A transcript written more recently than this means the session is mid-turn.
// Only used for sessions that report no status at all (see below).
export const ACTIVITY_MS = 60_000;

// Short tag for where a session lives, so two sessions in the SAME project are
// distinguishable on a key (their names truncate to the same text) and you know
// which app to look in. From the session file's own `entrypoint`.
export function sessionWhere(s) {
  const e = String(s?.entrypoint ?? "");
  if (e === "cli") return "cli";
  if (e.includes("vscode")) return "code";
  return "";
}

// Best-guess path of a session's transcript. Claude Code stores them as
// <projects>/<slugified cwd>/<sessionId>.jsonl, where the slug replaces path
// separators and underscores with "-". On Windows a cwd is "C:\\Users\\me\\proj",
// so backslashes and the drive colon have to go too — and since the exact
// Windows rule is unverified, callers must treat this as a HINT and fall back to
// finding <sessionId>.jsonl by name (see transcriptDirCandidates).
export function transcriptPathFor(projectsDir, s) {
  if (!s?.cwd || !s?.sessionId) return null;
  return joinPath(projectsDir, slugifyCwd(s.cwd), `${s.sessionId}.jsonl`);
}

// The slug Claude Code uses for a project directory name.
export function slugifyCwd(cwd) {
  return String(cwd).replace(/[/\\_:]/g, "-");
}

// Join without importing platform specifics into a pure module: Node accepts "/"
// on Windows too, so a forward-slash join is safe for reads.
function joinPath(...parts) {
  return parts.filter(Boolean).join("/");
}

// Derived display state for one session. `now` is injected for testability.
// `activityAt` is the session transcript's mtime, used ONLY when the session
// reports no status: the VS Code extension (entrypoint "claude-vscode") writes
// a session file with no status/waitingFor/statusUpdatedAt at all, and calling
// such a session "Idle" while it is mid-turn is simply wrong. A real status
// always wins over this heuristic.
// `pendingKind` is the state implied by a request still held in the approver queue (see
// approve.js pendingBySession). It is the ONLY blocked signal a VS Code session emits:
// with no status of its own, such a session could otherwise only ever be called working,
// idle or unknown while it sat on a prompt.
export function sessionState(s, now = Date.now(), activityAt = null, pendingKind = null) {
  const st = s?.status;
  if (st === "waiting") {
    // The session's own waitingFor is more specific than anything the queue implies, so
    // it wins outright; both sources agree the session is blocked either way.
    const w = String(s.waitingFor ?? "").toLowerCase();
    return QUESTION_WAITS.has(w) ? "input-needed" : "needs-approval";
  }
  // Beats busy/idle/absent: a held request is direct evidence the process is blocked on
  // the human, while `busy` may simply be a status write that has not landed yet (the
  // prompt races the hook, and the poll is up to 5s stale).
  if (pendingKind) return pendingKind;
  if (st === "busy" || st === "shell") return "working";
  if (!st) {
    // No status reported (VS Code extension). Infer from transcript activity if
    // the caller supplied it; otherwise say so rather than inventing "Idle".
    if (!activityAt) return "unknown";
    return Math.max(0, now - activityAt) < ACTIVITY_MS ? "working" : "idle";
  }
  if (st === "idle") {
    // Deliberately NO fallback to updatedAt: on a Claude Code build that bumps
    // updatedAt as a heartbeat, that would pin an hours-idle session at green
    // "Finished" forever. Missing statusUpdatedAt → plain idle.
    const at = s.statusUpdatedAt;
    if (!at) return "idle";
    // Math.max guards a future timestamp (clock skew) from reading as stale.
    return Math.max(0, now - at) < FINISHED_MS ? "finished" : "idle";
  }
  return "idle"; // an unrecognized status value (missing is handled above)
}

// Slack for the comparison below. The session file is written moments after the
// process starts, so a genuine pair has procStart <= startedAt; this only
// absorbs clock and rounding noise, never a real recycle (which is minutes to
// days later).
export const PID_START_SLACK_MS = 60_000;

// Does this session's pid look like it belongs to a *different*, later process?
//
// `process.kill(pid, 0)` only asks "is some process alive with this pid". A
// session file outlives a crashed session, so once the OS hands that pid to an
// unrelated process the session reads as running forever — inflating the Sessions
// count and adding a dead entry to the Focus/Status cycles. The process that
// wrote the session file necessarily existed before the session did, so a process
// younger than its own session cannot be the one that wrote it.
//
// Fails OPEN on every uncertainty (no startedAt, pid missing from the process
// listing, ps unavailable): showing a phantom session is a cosmetic annoyance,
// while hiding a live one that needs an answer defeats the point of the plugin.
export function pidLooksRecycled(session, procStartMs, slackMs = PID_START_SLACK_MS) {
  const startedAt = session?.startedAt;
  if (!startedAt || procStartMs == null) return false;
  return procStartMs > startedAt + slackMs;
}

// Signature of the session list *including* derived state, for change detection.
// The caller must compare this against the signature it cached on the PREVIOUS
// tick — recomputing both sides with the same `now` makes time-only transitions
// (finished → idle at 60s) cancel out and never repaint.
export function sessionSig(sessions, now = Date.now(), activity = null, pending = null) {
  return JSON.stringify((sessions ?? []).map((s) => [s.pid, s.status ?? "", s.waitingFor ?? "", sessionState(s, now, actOf(s, activity), pendKind(s, pending))]));
}

// Lower rank = more urgent = shown first on an auto-bound key.
const URGENCY = { "needs-approval": 0, "input-needed": 1, working: 2, finished: 3, idle: 4, unknown: 5 };
// `activity` (optional) is a Map<sessionId, transcript mtimeMs>, consulted only
// for sessions that report no status of their own.
const actOf = (s, activity) => (activity && s?.sessionId ? activity.get(s.sessionId) ?? null : null);
// `pending` (optional) is the Map<sessionId, {kind, reason, since}> from approve.js.
const pendOf = (s, pending) => (pending && s?.sessionId ? pending.get(s.sessionId) ?? null : null);
const pendKind = (s, pending) => pendOf(s, pending)?.kind ?? null;
const rank = (s, now, activity, pending) => URGENCY[sessionState(s, now, actOf(s, activity), pendKind(s, pending))] ?? 5;

// Sessions blocked on the human, most urgent first. Returns the *full* poller
// records (callers pass them to platform.focusWindow, which needs `pid`).
export function blockedSessions(sessions, now = Date.now(), activity = null, pending = null) {
  return (sessions ?? [])
    .filter((s) => rank(s, now, activity, pending) <= URGENCY["input-needed"])
    .sort((a, b) => rank(a, now, activity, pending) - rank(b, now, activity, pending) || (b.updatedAt ?? 0) - (a.updatedAt ?? 0) || (a.pid ?? 0) - (b.pid ?? 0));
}

// Compact duration for a key's sub-line: "18s" / "3m" / "1h 20m". Null/absent
// input yields "" so callers can omit the segment rather than print a bogus age.
export function fmtShort(ms) {
  if (ms == null || !isFinite(ms)) return "";
  const t = Math.max(0, ms);
  if (t < 60_000) return Math.floor(t / 1000) + "s";
  const m = Math.floor(t / 60_000);
  if (m < 60) return m + "m";
  return Math.floor(m / 60) + "h " + (m % 60) + "m";
}

// Display-shortened wait reason. The key's detail line is 13px with no
// truncation, so "permission prompt · 1h 20m" overflowed a 144px key at both
// ends; the first word carries the meaning. Unknown reasons pass through.
const WAIT_SHORT = {
  "permission prompt": "permission",
  "sandbox request": "sandbox",
  "worker request": "worker",
  "input needed": "input",
  "dialog open": "dialog",
};
export function shortWait(reason) {
  const r = String(reason ?? "").toLowerCase();
  if (!r) return "";
  return WAIT_SHORT[r] ?? String(reason);
}

// Which slot an auto (unbound) Status key occupies, so several such keys show
// DIFFERENT sessions: slot 0 gets the most urgent, slot 1 the next, and so on.
//
// Scoped PER DEVICE: with two Stream Decks both profiles are live at once and
// their keys share coordinates, so a global ordering made the second deck's key
// take slot 1 (an idle session) — each deck must number its own keys from 0.
// Within a device, ordered by physical position (row, then column), never by the
// order contexts landed in a map (unstable). Keys without coordinates sort last.
//   keys: [{ context, device, row, col }]
export function autoSlot(keys, context) {
  const me = (keys ?? []).find((k) => k.context === context);
  const sorted = (keys ?? []).filter((k) => (k.device ?? null) === (me?.device ?? null)).sort((a, b) => {
    const ar = a.row ?? Infinity, br = b.row ?? Infinity;
    if (ar !== br) return ar - br;
    const ac = a.col ?? Infinity, bc = b.col ?? Infinity;
    if (ac !== bc) return ac - bc;
    return String(a.context).localeCompare(String(b.context));
  });
  return Math.max(0, sorted.findIndex((k) => k.context === context));
}

// basename(cwd), lowercased; "" when cwd is missing.
export function sessionProject(s) {
  return path.basename(s.cwd ?? "").toLowerCase();
}

// Display order: most urgent first (a session blocked on you outranks one that's
// merely working), then most-recently-updated, then lowest pid (stable final
// tiebreak so the primary never flickers between equal peers).
function byDisplayOrder(a, b, now, activity, pending) {
  const ra = rank(a, now, activity, pending), rb = rank(b, now, activity, pending);
  if (ra !== rb) return ra - rb;
  if ((b.updatedAt ?? 0) !== (a.updatedAt ?? 0)) return (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
  return (a.pid ?? 0) - (b.pid ?? 0);
}

// Resolve one Status key to the sessions it could display.
//   sessions    - live sessions (state.sessions)
//   project     - the key's configured project (basename match); "" => auto
//   autoIdx     - accepted for call-site compatibility, no longer used (see the
//                 return below: every key shows the most urgent session).
export function resolveStatusKey(sessions, project, autoIdx = 0, now = Date.now(), activity = null, pending = null) {
  const explicit = !!(project && String(project).trim());
  const want = explicit ? String(project).trim().toLowerCase() : null;
  const list = (sessions ?? [])
    .filter((s) => (explicit ? sessionProject(s) === want : true))
    .sort((a, b) => byDisplayOrder(a, b, now, activity, pending))
    .map((s) => {
      // A VS Code session has no waitingFor or statusUpdatedAt of its own, so the held
      // request supplies BOTH the reason and the moment the wait began — otherwise the
      // key would read a bare "needs you" and pulse forever with no age.
      const p = pendOf(s, pending);
      return {
        name: path.basename(s.cwd ?? "") || "claude",
        state: sessionState(s, now, actOf(s, activity), p?.kind ?? null),
        waitingFor: s.status === "waiting" ? String(s.waitingFor ?? "permission prompt") : (p?.reason ?? ""),
        // null when the session reports no timestamp at all (VS Code) — otherwise
        // `now - 0` renders as an absurd age like "495817h idle".
        statusAge: s.statusUpdatedAt ?? s.updatedAt ? Math.max(0, now - (s.statusUpdatedAt ?? s.updatedAt)) : null,
        // When the wait began. statusUpdatedAt ONLY — never the updatedAt fallback,
        // so every key measures the same wait from the same anchor.
        waitingSince: s.status === "waiting" && s.statusUpdatedAt ? s.statusUpdatedAt : (p?.since ?? null),
        cwd: s.cwd ?? "",
        sessionId: s.sessionId ?? null,
        pid: s.pid ?? null,
        where: sessionWhere(s),
      };
    });
  // Explicit (project-bound) keys always show their project's most urgent
  // session. Auto keys take their slot: 0 = most urgent, 1 = next, ... so a row
  // of auto keys covers several sessions. An out-of-range slot yields the "none"
  // placeholder via statusEntry (more keys than sessions -> "no session").
  return { list, index: explicit ? 0 : autoIdx, count: list.length };
}

// The entry a key should show now (honoring an active cycle offset), or a
// "none" placeholder when nothing is bound.
export function statusEntry(resolved, cycleIdx = null) {
  const i = cycleIdx != null ? cycleIdx : resolved.index;
  return resolved.list[i] ?? { name: "", state: "none", waitingFor: "", statusAge: 0, waitingSince: null, cwd: "", sessionId: null, pid: null, where: "" };
}

