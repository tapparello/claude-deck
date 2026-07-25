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
const APPROVAL_WAITS = new Set(["permission prompt", "sandbox request", "worker request"]);
export const FINISHED_MS = 60_000;

// Derived display state for one session. `now` is injected for testability.
export function sessionState(s, now = Date.now()) {
  const st = s?.status;
  if (st === "waiting") {
    const w = String(s.waitingFor ?? "permission prompt").toLowerCase();
    // Unknown/new waitingFor values read as "needs your input", not "approve me":
    // claiming an approval is pending when it isn't would be the worse error.
    return APPROVAL_WAITS.has(w) ? "needs-approval" : "input-needed";
  }
  if (st === "busy" || st === "shell") return "working";
  if (st === "idle") {
    const at = s.statusUpdatedAt ?? s.updatedAt ?? 0;
    // Math.max guards a future timestamp (clock skew) from reading as stale.
    return Math.max(0, now - at) < FINISHED_MS ? "finished" : "idle";
  }
  return "idle"; // unknown or missing status
}

// Lower rank = more urgent = shown first on an auto-bound key.
const URGENCY = { "needs-approval": 0, "input-needed": 1, working: 2, finished: 3, idle: 4 };
const rank = (s, now) => URGENCY[sessionState(s, now)] ?? 4;

// Sessions blocked on the human, most urgent first. Returns the *full* poller
// records (callers pass them to platform.focusWindow, which needs `pid`).
export function blockedSessions(sessions, now = Date.now()) {
  return (sessions ?? [])
    .filter((s) => rank(s, now) <= URGENCY["input-needed"])
    .sort((a, b) => rank(a, now) - rank(b, now) || (b.updatedAt ?? 0) - (a.updatedAt ?? 0) || (a.pid ?? 0) - (b.pid ?? 0));
}

// basename(cwd), lowercased; "" when cwd is missing.
export function sessionProject(s) {
  return path.basename(s.cwd ?? "").toLowerCase();
}

// Display order: most urgent first (a session blocked on you outranks one that's
// merely working), then most-recently-updated, then lowest pid (stable final
// tiebreak so the primary never flickers between equal peers).
function byDisplayOrder(a, b, now) {
  const ra = rank(a, now), rb = rank(b, now);
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
export function resolveStatusKey(sessions, project, autoIdx = 0, now = Date.now()) {
  const explicit = !!(project && String(project).trim());
  const want = explicit ? String(project).trim().toLowerCase() : null;
  const list = (sessions ?? [])
    .filter((s) => (explicit ? sessionProject(s) === want : true))
    .sort((a, b) => byDisplayOrder(a, b, now))
    .map((s) => ({
      name: path.basename(s.cwd ?? "") || "claude",
      state: sessionState(s, now),
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
