import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveStatusKey, statusEntry, sessionProject, autoOrdinal, sessionState, blockedSessions, sessionSig, FINISHED_MS } from "../src/status.js";

const S = (over) => ({ sessionId: "x", cwd: "/Users/me/web-app", status: "idle", updatedAt: 1, pid: 100, ...over });

// ---------- sessionState: the real Claude Code enum (2.1.219) ----------
// status ∈ busy|shell|idle|waiting; waitingFor ∈ permission prompt|input needed|
// dialog open|sandbox request|worker request
const NOW = 1_000_000_000;

test("waiting + approval-ish waitingFor => needs-approval", () => {
  for (const w of ["permission prompt", "sandbox request", "worker request"]) {
    assert.equal(sessionState({ status: "waiting", waitingFor: w }, NOW), "needs-approval", w);
  }
  // case-insensitive, and missing waitingFor falls back to a permission prompt
  assert.equal(sessionState({ status: "waiting", waitingFor: "Permission Prompt" }, NOW), "needs-approval");
  assert.equal(sessionState({ status: "waiting" }, NOW), "needs-approval");
});

test("waiting + question-ish waitingFor => input-needed", () => {
  for (const w of ["input needed", "dialog open"]) {
    assert.equal(sessionState({ status: "waiting", waitingFor: w }, NOW), "input-needed", w);
  }
});

test("unknown or missing waitingFor => needs-approval (one policy for both)", () => {
  assert.equal(sessionState({ status: "waiting", waitingFor: "something new" }, NOW), "needs-approval");
  assert.equal(sessionState({ status: "waiting" }, NOW), "needs-approval");
});

test("busy and shell are both working", () => {
  assert.equal(sessionState({ status: "busy" }, NOW), "working");
  assert.equal(sessionState({ status: "shell" }, NOW), "working");
});

test("idle splits into finished/idle at the FINISHED_MS boundary", () => {
  assert.equal(sessionState({ status: "idle", statusUpdatedAt: NOW - 1000 }, NOW), "finished");
  assert.equal(sessionState({ status: "idle", statusUpdatedAt: NOW - (FINISHED_MS - 1) }, NOW), "finished");
  assert.equal(sessionState({ status: "idle", statusUpdatedAt: NOW - FINISHED_MS }, NOW), "idle");
  assert.equal(sessionState({ status: "idle", statusUpdatedAt: NOW - 600_000 }, NOW), "idle");
});

test("missing statusUpdatedAt is plain idle, never a sticky green 'Finished'", () => {
  // No fallback to updatedAt on purpose: a build that bumps updatedAt as a
  // heartbeat would otherwise pin an hours-idle session at green forever.
  assert.equal(sessionState({ status: "idle", updatedAt: NOW - 1000 }, NOW), "idle");
  assert.equal(sessionState({ status: "idle" }, NOW), "idle");
});

test("sessionSig changes across the finished→idle boundary for identical records", () => {
  // The bug this pins: comparing sig(list, now) against sig(list, now) cancels
  // the derived state out, so the 60s transition never repaints. A cached
  // previous-tick signature must differ from the current one.
  const rec = { pid: 42, status: "idle", statusUpdatedAt: NOW - 59_000 };
  const before = sessionSig([rec], NOW); // still "finished"
  const after = sessionSig([rec], NOW + 2000); // now "idle"
  assert.notEqual(before, after);
  assert.match(before, /finished/);
  assert.match(after, /idle/);
});

test("sessionSig is stable when nothing changed", () => {
  const rec = { pid: 42, status: "busy", updatedAt: NOW };
  assert.equal(sessionSig([rec], NOW), sessionSig([rec], NOW + 1000));
});

test("clock skew (future timestamp) does not produce a bogus state", () => {
  assert.equal(sessionState({ status: "idle", statusUpdatedAt: NOW + 60_000 }, NOW), "finished");
});

test("unknown/missing status is idle, and waitingFor without waiting is ignored", () => {
  assert.equal(sessionState({}, NOW), "idle");
  assert.equal(sessionState({ status: "something-new" }, NOW), "idle");
  assert.equal(sessionState({ status: "busy", waitingFor: "permission prompt" }, NOW), "working");
});

// ---------- urgency ordering + blockedSessions ----------
test("a waiting session outranks a busy one even when older", () => {
  const sessions = [
    S({ cwd: "/a/app", status: "busy", updatedAt: 99, pid: 1 }),
    S({ cwd: "/b/app", status: "waiting", waitingFor: "permission prompt", updatedAt: 1, pid: 2 }),
  ];
  const e = statusEntry(resolveStatusKey(sessions, "app", 0, NOW));
  assert.equal(e.state, "needs-approval");
  assert.equal(e.cwd, "/b/app");
  assert.equal(e.waitingFor, "permission prompt");
});

test("needs-approval outranks input-needed", () => {
  const sessions = [
    S({ cwd: "/a/app", status: "waiting", waitingFor: "input needed", updatedAt: 99, pid: 1 }),
    S({ cwd: "/b/app", status: "waiting", waitingFor: "permission prompt", updatedAt: 1, pid: 2 }),
  ];
  assert.equal(statusEntry(resolveStatusKey(sessions, "app", 0, NOW)).cwd, "/b/app");
});

test("entries carry pid (focusWindow needs it) and statusAge", () => {
  const e = statusEntry(resolveStatusKey([S({ pid: 4242, statusUpdatedAt: NOW - 5000 })], "", 0, NOW));
  assert.equal(e.pid, 4242);
  assert.equal(e.statusAge, 5000);
});

test("blockedSessions returns full poller records, urgency-ordered", () => {
  const busy = S({ cwd: "/a/one", status: "busy", pid: 1 });
  const input = S({ cwd: "/b/two", status: "waiting", waitingFor: "input needed", pid: 2 });
  const perm = S({ cwd: "/c/three", status: "waiting", waitingFor: "permission prompt", pid: 3 });
  const out = blockedSessions([busy, input, perm], NOW);
  assert.deepEqual(out.map((s) => s.pid), [3, 2]);
  assert.equal(out[0].cwd, "/c/three"); // full record, not a projection
  assert.equal(blockedSessions([busy], NOW).length, 0);
});

test("explicit binding matches by basename(cwd), case-insensitive", () => {
  const sessions = [S({ cwd: "/a/web-app", pid: 1 }), S({ cwd: "/b/api", pid: 2 })];
  const r = resolveStatusKey(sessions, "WEB-APP");
  assert.equal(r.count, 1);
  assert.equal(statusEntry(r).name, "web-app");
});

test("primary is working-first, then most-recent, then lowest pid", () => {
  const sessions = [
    S({ cwd: "/x/app", status: "idle", updatedAt: 9, pid: 5 }),
    S({ cwd: "/y/app", status: "busy", updatedAt: 1, pid: 7 }),
  ];
  const r = resolveStatusKey(sessions, "app");
  assert.equal(r.count, 2);
  assert.equal(statusEntry(r).state, "working"); // busy wins despite older updatedAt
  assert.equal(statusEntry(r).cwd, "/y/app");
});

test("collision count reflects multiple same-project sessions", () => {
  const sessions = [S({ cwd: "/a/claude-deck", pid: 1 }), S({ cwd: "/b/claude-deck", pid: 2 })];
  const r = resolveStatusKey(sessions, "claude-deck");
  assert.equal(r.count, 2);
});

test("auto keys bind to distinct sessions by ordinal", () => {
  const sessions = [
    S({ cwd: "/a/one", status: "busy", updatedAt: 5, pid: 1 }),
    S({ cwd: "/b/two", status: "idle", updatedAt: 4, pid: 2 }),
  ];
  assert.equal(statusEntry(resolveStatusKey(sessions, "", 0)).name, "one"); // working first
  assert.equal(statusEntry(resolveStatusKey(sessions, "", 1)).name, "two");
});

test("auto ordering is working-first even when the working session is older", () => {
  const sessions = [
    S({ cwd: "/a/old-busy", status: "busy", updatedAt: 1, pid: 9 }),
    S({ cwd: "/b/new-idle", status: "idle", updatedAt: 99, pid: 3 }),
  ];
  assert.equal(statusEntry(resolveStatusKey(sessions, "", 0)).name, "old-busy");
});

test("no candidate => none", () => {
  const r = resolveStatusKey([], "web-app");
  assert.equal(r.count, 0);
  assert.equal(statusEntry(r).state, "none");
});

test("auto ordinal beyond candidates => none", () => {
  const r = resolveStatusKey([S({ cwd: "/a/only", pid: 1 })], "", 3);
  assert.equal(statusEntry(r).state, "none");
});

test("missing cwd/status handled gracefully", () => {
  const r = resolveStatusKey([{ sessionId: "z", pid: 1 }], "");
  assert.equal(statusEntry(r).state, "idle"); // absent status => idle
  assert.equal(sessionProject({}), "");
  assert.equal(statusEntry(resolveStatusKey([{ sessionId: "z", pid: 1 }], "")).name, "claude");
});

test("recency tiebreak: same state, more-recent updatedAt wins", () => {
  const sessions = [
    S({ cwd: "/a/proj", status: "idle", updatedAt: 5, pid: 1 }),
    S({ cwd: "/b/proj", status: "idle", updatedAt: 50, pid: 9 }),
  ];
  const r = resolveStatusKey(sessions, "proj");
  assert.equal(statusEntry(r).cwd, "/b/proj"); // newer wins despite higher pid
});

test("cycle offset selects a specific candidate", () => {
  const sessions = [S({ cwd: "/a/dup", pid: 1 }), S({ cwd: "/b/dup", pid: 2 })];
  const r = resolveStatusKey(sessions, "dup");
  assert.equal(statusEntry(r, 1).cwd, "/b/dup");
});

test("autoOrdinal assigns stable distinct positions, fallback 0", () => {
  const ctxs = ["ctxB", "ctxA", "ctxC"]; // unsorted on purpose
  assert.equal(autoOrdinal(ctxs, "ctxA"), 0);
  assert.equal(autoOrdinal(ctxs, "ctxB"), 1);
  assert.equal(autoOrdinal(ctxs, "ctxC"), 2);
  assert.equal(autoOrdinal(ctxs, "missing"), 0);
});
