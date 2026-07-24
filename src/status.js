// Pure resolver for the per-session "Claude Status" key.
// No I/O — operates on the session objects produced by pollSessions().
import path from "node:path";

// A session is "working" when its status is present and not "idle".
const isWorking = (s) => !!(s.status && s.status !== "idle");

// basename(cwd), lowercased; "" when cwd is missing.
export function sessionProject(s) {
  return path.basename(s.cwd ?? "").toLowerCase();
}

// Display order: working first, then most-recently-updated, then lowest pid
// (stable final tiebreak so the primary never flickers between equal peers).
function byDisplayOrder(a, b) {
  if (isWorking(a) !== isWorking(b)) return isWorking(a) ? -1 : 1;
  if ((b.updatedAt ?? 0) !== (a.updatedAt ?? 0)) return (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
  return (a.pid ?? 0) - (b.pid ?? 0);
}

// Resolve one Status key to the sessions it could display.
//   sessions    - live sessions (state.sessions)
//   project     - the key's configured project (basename match); "" => auto
//   autoIdx     - for auto keys, this key's 0-based position among visible auto
//                 keys, so multiple auto keys bind to distinct sessions; ignored
//                 for explicit keys.
export function resolveStatusKey(sessions, project, autoIdx = 0) {
  const explicit = !!(project && String(project).trim());
  const want = explicit ? String(project).trim().toLowerCase() : null;
  const list = (sessions ?? [])
    .filter((s) => (explicit ? sessionProject(s) === want : true))
    .sort(byDisplayOrder)
    .map((s) => ({
      name: path.basename(s.cwd ?? "") || "claude",
      state: isWorking(s) ? "working" : "idle",
      cwd: s.cwd ?? "",
      sessionId: s.sessionId ?? null,
    }));
  return { list, index: explicit ? 0 : autoIdx, count: list.length };
}

// The entry a key should show now (honoring an active cycle offset), or a
// "none" placeholder when nothing is bound.
export function statusEntry(resolved, cycleIdx = null) {
  const i = cycleIdx != null ? cycleIdx : resolved.index;
  return resolved.list[i] ?? { name: "", state: "none", cwd: "", sessionId: null };
}

// Stable 0-based position of `context` among the given auto-key contexts,
// sorted deterministically so distinct keys get distinct ordinals.
export function autoOrdinal(autoContexts, context) {
  return Math.max(0, (autoContexts ?? []).slice().sort().indexOf(context));
}
