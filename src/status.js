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
//   autoIdx     - for auto keys, this key's 0-based position among visible auto
//                 keys, so multiple auto keys bind to distinct sessions; ignored
//                 for explicit keys.
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
      statusAge: Math.max(0, now - (s.statusUpdatedAt ?? s.updatedAt ?? 0)),
      cwd: s.cwd ?? "",
      sessionId: s.sessionId ?? null,
      pid: s.pid ?? null,
    }));
  return { list, index: explicit ? 0 : autoIdx, count: list.length };
}

// The entry a key should show now (honoring an active cycle offset), or a
// "none" placeholder when nothing is bound.
export function statusEntry(resolved, cycleIdx = null) {
  const i = cycleIdx != null ? cycleIdx : resolved.index;
  return resolved.list[i] ?? { name: "", state: "none", waitingFor: "", statusAge: 0, cwd: "", sessionId: null, pid: null };
}

// Stable 0-based position of `context` among the given auto-key contexts,
// sorted deterministically so distinct keys get distinct ordinals.
export function autoOrdinal(autoContexts, context) {
  return Math.max(0, (autoContexts ?? []).slice().sort().indexOf(context));
}
