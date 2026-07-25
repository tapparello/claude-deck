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

// Path of a session's transcript, or null if it can't be derived. Claude Code
// stores them as <projects>/<cwd with / and _ replaced by ->/<sessionId>.jsonl.
export function transcriptPathFor(projectsDir, s) {
  if (!s?.cwd || !s?.sessionId) return null;
  return `${projectsDir}/${String(s.cwd).replace(/[/_]/g, "-")}/${s.sessionId}.jsonl`;
}

// Derived display state for one session. `now` is injected for testability.
// `activityAt` is the session transcript's mtime, used ONLY when the session
// reports no status: the VS Code extension (entrypoint "claude-vscode") writes
// a session file with no status/waitingFor/statusUpdatedAt at all, and calling
// such a session "Idle" while it is mid-turn is simply wrong. A real status
// always wins over this heuristic.
export function sessionState(s, now = Date.now(), activityAt = null) {
  const st = s?.status;
  if (st === "waiting") {
    const w = String(s.waitingFor ?? "").toLowerCase();
    return QUESTION_WAITS.has(w) ? "input-needed" : "needs-approval";
  }
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

// Signature of the session list *including* derived state, for change detection.
// The caller must compare this against the signature it cached on the PREVIOUS
// tick — recomputing both sides with the same `now` makes time-only transitions
// (finished → idle at 60s) cancel out and never repaint.
export function sessionSig(sessions, now = Date.now(), activity = null) {
  return JSON.stringify((sessions ?? []).map((s) => [s.pid, s.status ?? "", s.waitingFor ?? "", sessionState(s, now, actOf(s, activity))]));
}

// Lower rank = more urgent = shown first on an auto-bound key.
const URGENCY = { "needs-approval": 0, "input-needed": 1, working: 2, finished: 3, idle: 4, unknown: 5 };
// `activity` (optional) is a Map<sessionId, transcript mtimeMs>, consulted only
// for sessions that report no status of their own.
const actOf = (s, activity) => (activity && s?.sessionId ? activity.get(s.sessionId) ?? null : null);
const rank = (s, now, activity) => URGENCY[sessionState(s, now, actOf(s, activity))] ?? 5;

// Sessions blocked on the human, most urgent first. Returns the *full* poller
// records (callers pass them to platform.focusWindow, which needs `pid`).
export function blockedSessions(sessions, now = Date.now(), activity = null) {
  return (sessions ?? [])
    .filter((s) => rank(s, now, activity) <= URGENCY["input-needed"])
    .sort((a, b) => rank(a, now, activity) - rank(b, now, activity) || (b.updatedAt ?? 0) - (a.updatedAt ?? 0) || (a.pid ?? 0) - (b.pid ?? 0));
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
function byDisplayOrder(a, b, now, activity) {
  const ra = rank(a, now, activity), rb = rank(b, now, activity);
  if (ra !== rb) return ra - rb;
  if ((b.updatedAt ?? 0) !== (a.updatedAt ?? 0)) return (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
  return (a.pid ?? 0) - (b.pid ?? 0);
}

// Resolve one Status key to the sessions it could display.
//   sessions    - live sessions (state.sessions)
//   project     - the key's configured project (basename match); "" => auto
//   autoIdx     - accepted for call-site compatibility, no longer used (see the
//                 return below: every key shows the most urgent session).
export function resolveStatusKey(sessions, project, autoIdx = 0, now = Date.now(), activity = null) {
  const explicit = !!(project && String(project).trim());
  const want = explicit ? String(project).trim().toLowerCase() : null;
  const list = (sessions ?? [])
    .filter((s) => (explicit ? sessionProject(s) === want : true))
    .sort((a, b) => byDisplayOrder(a, b, now, activity))
    .map((s) => ({
      name: path.basename(s.cwd ?? "") || "claude",
      state: sessionState(s, now, actOf(s, activity)),
      waitingFor: s.status === "waiting" ? String(s.waitingFor ?? "permission prompt") : "",
      // null when the session reports no timestamp at all (VS Code) — otherwise
      // `now - 0` renders as an absurd age like "495817h idle".
      statusAge: s.statusUpdatedAt ?? s.updatedAt ? Math.max(0, now - (s.statusUpdatedAt ?? s.updatedAt)) : null,
      cwd: s.cwd ?? "",
      sessionId: s.sessionId ?? null,
      pid: s.pid ?? null,
      where: sessionWhere(s),
    }));
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
  return resolved.list[i] ?? { name: "", state: "none", waitingFor: "", statusAge: 0, cwd: "", sessionId: null, pid: null };
}

