import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveStatusKey, statusEntry, sessionProject, autoSlot, sessionWhere, fmtShort, shortWait, slugifyCwd, sessionState, blockedSessions, sessionSig, FINISHED_MS, transcriptPathFor, pidLooksRecycled } from "../src/status.js";

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

test("an unrecognized status is idle; waitingFor without waiting is ignored", () => {
  assert.equal(sessionState({ status: "something-new" }, NOW), "idle");
  assert.equal(sessionState({ status: "busy", waitingFor: "permission prompt" }, NOW), "working");
});

// The VS Code extension (entrypoint "claude-vscode") writes a session file with
// NO status/waitingFor/statusUpdatedAt at all. Calling that "Idle" is a lie when
// the session is mid-turn, so a status-less session is "unknown" unless the
// caller supplies transcript activity to infer from.
test("status-less session is 'unknown', not a fake Idle", () => {
  assert.equal(sessionState({}, NOW), "unknown");
  assert.equal(sessionState({ pid: 1, cwd: "/x/y" }, NOW), "unknown");
});

test("status-less session uses injected transcript activity when available", () => {
  const s = { pid: 1, cwd: "/x/y" };
  assert.equal(sessionState(s, NOW, NOW - 5_000), "working"); // written 5s ago
  assert.equal(sessionState(s, NOW, NOW - 600_000), "idle"); // stale
  assert.equal(sessionState(s, NOW, null), "unknown"); // no info
});

test("a real status always wins over transcript activity", () => {
  // Never let the heuristic override what Claude Code actually reported.
  assert.equal(sessionState({ status: "waiting", waitingFor: "permission prompt" }, NOW, NOW), "needs-approval");
  assert.equal(sessionState({ status: "idle", statusUpdatedAt: NOW - 600_000 }, NOW, NOW), "idle");
});

test("slugifyCwd handles Windows paths too (backslashes and the drive colon)", () => {
  assert.equal(slugifyCwd("/Users/me/Developer/my_mobile_app"), "-Users-me-Developer-my-mobile-app");
  // A Windows cwd used to pass through untouched, so the transcript was never
  // found there and every VS Code session read "no status".
  assert.equal(slugifyCwd("C:\\Users\\me\\my_proj"), "C--Users-me-my-proj");
  assert.ok(!slugifyCwd("C:\\Users\\me").includes("\\"), "no backslashes survive");
  assert.ok(!slugifyCwd("C:\\Users\\me").includes(":"), "no drive colon survives");
});

test("transcriptPathFor builds the slugified project path", () => {
  assert.equal(
    transcriptPathFor("/root", { cwd: "/Users/me/Developer/my_mobile_app", sessionId: "abc" }),
    "/root/-Users-me-Developer-my-mobile-app/abc.jsonl",
  );
  assert.equal(transcriptPathFor("/root", { cwd: "/x", sessionId: null }), null);
  assert.equal(transcriptPathFor("/root", { sessionId: "abc" }), null);
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
  const sessions = [S({ cwd: "/a/agent-vitals", pid: 1 }), S({ cwd: "/b/agent-vitals", pid: 2 })];
  const r = resolveStatusKey(sessions, "agent-vitals");
  assert.equal(r.count, 2);
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

test("missing cwd/status handled gracefully", () => {
  const r = resolveStatusKey([{ sessionId: "z", pid: 1 }], "");
  // A session that reports no status is "unknown", not a fabricated "idle"
  // (see the VS Code / claude-vscode case above).
  assert.equal(statusEntry(r).state, "unknown");
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


// Auto (unbound) Status keys always show the MOST URGENT session. They used to be
// distributed by a per-key ordinal derived from the live `views` map, which made
// the same key flip between ordinals as keys/pages appeared — pinning it to a
// second, idle session. Deliberate per-session keys are made by binding a project.
test("autoSlot numbers each device's keys independently (two Stream Decks)", () => {
  // Both decks have a key at the same coordinates; each must start at slot 0,
  // or the second deck's key shows the 2nd-most-urgent session instead.
  const keys = [
    { context: "deckA-key", device: "A", row: 2, col: 1 },
    { context: "deckB-key", device: "B", row: 2, col: 1 },
  ];
  assert.equal(autoSlot(keys, "deckA-key"), 0);
  assert.equal(autoSlot(keys, "deckB-key"), 0);
  // ...and a second key on deck A still gets slot 1 on that deck.
  keys.push({ context: "deckA-key2", device: "A", row: 2, col: 2 });
  assert.equal(autoSlot(keys, "deckA-key"), 0);
  assert.equal(autoSlot(keys, "deckA-key2"), 1);
  assert.equal(autoSlot(keys, "deckB-key"), 0);
});

test("autoSlot orders by physical position (row, then column), not map order", () => {
  const keys = [
    { context: "zzz", row: 0, col: 1 },
    { context: "aaa", row: 1, col: 0 },
    { context: "mmm", row: 0, col: 0 },
  ];
  assert.equal(autoSlot(keys, "mmm"), 0); // top-left first...
  assert.equal(autoSlot(keys, "zzz"), 1); // ...then along the row
  assert.equal(autoSlot(keys, "aaa"), 2); // ...then the next row
  assert.equal(autoSlot(keys, "missing"), 0); // unknown context -> slot 0
  // A key with no coordinates sorts last rather than stealing slot 0.
  assert.equal(autoSlot([{ context: "n" }, { context: "m", row: 0, col: 0 }], "m"), 0);
});

test("several auto keys cover different sessions, most urgent first", () => {
  const sessions = [
    S({ cwd: "/a/idle-proj", status: "idle", statusUpdatedAt: NOW - 600_000, updatedAt: 99, pid: 1 }),
    S({ cwd: "/b/busy-proj", status: "busy", updatedAt: 1, pid: 2 }),
    S({ cwd: "/c/ask-proj", status: "waiting", waitingFor: "permission prompt", updatedAt: 1, pid: 3 }),
  ];
  assert.equal(statusEntry(resolveStatusKey(sessions, "", 0, NOW)).name, "ask-proj"); // slot 0
  assert.equal(statusEntry(resolveStatusKey(sessions, "", 1, NOW)).name, "busy-proj"); // slot 1
  assert.equal(statusEntry(resolveStatusKey(sessions, "", 2, NOW)).name, "idle-proj"); // slot 2
  // more keys than sessions -> honest empty slot
  assert.equal(statusEntry(resolveStatusKey(sessions, "", 3, NOW)).state, "none");
});

test("slot 0 always holds the most urgent session", () => {
  const sessions = [
    S({ cwd: "/a/idle-proj", status: "idle", statusUpdatedAt: NOW - 600_000, updatedAt: 99, pid: 1 }),
    S({ cwd: "/b/busy-proj", status: "busy", updatedAt: 1, pid: 2 }),
    S({ cwd: "/c/ask-proj", status: "waiting", waitingFor: "permission prompt", updatedAt: 1, pid: 3 }),
  ];
  assert.equal(statusEntry(resolveStatusKey(sessions, "", 0, NOW)).state, "needs-approval");
});

test("statusAge is null when the session reports no timestamps (no '495817h')", () => {
  const e = statusEntry(resolveStatusKey([{ sessionId: "z", pid: 1, cwd: "/x/y" }], "", 0, NOW));
  assert.equal(e.statusAge, null);
});

test("sessionWhere tags the host so same-project sessions are distinguishable", () => {
  assert.equal(sessionWhere({ entrypoint: "cli" }), "cli");
  assert.equal(sessionWhere({ entrypoint: "claude-vscode" }), "code");
  assert.equal(sessionWhere({}), "");
  const two = [
    S({ cwd: "/a/agent-vitals", entrypoint: "cli", status: "busy", pid: 1 }),
    S({ cwd: "/b/agent-vitals", entrypoint: "claude-vscode", pid: 2 }),
  ];
  const r = resolveStatusKey(two, "agent-vitals", 0, NOW);
  assert.deepEqual(r.list.map((e) => e.where), ["cli", "code"]);
});

// Compact wait duration for a blocked key's sub-line ("permission prompt · 3m").
test("fmtShort: seconds under a minute, minutes under an hour, then h m", () => {
  assert.equal(fmtShort(0), "0s");
  assert.equal(fmtShort(18_000), "18s");
  assert.equal(fmtShort(59_999), "59s");
  assert.equal(fmtShort(60_000), "1m");
  assert.equal(fmtShort(3 * 60_000 + 20_000), "3m");
  assert.equal(fmtShort(59 * 60_000), "59m");
  assert.equal(fmtShort(60 * 60_000), "1h 0m");
  assert.equal(fmtShort(80 * 60_000), "1h 20m");
  assert.equal(fmtShort(null), "");
  assert.equal(fmtShort(-5), "0s"); // clock skew must not print "-1s"
});

// The detail line is 13px with no truncation on a 144px key, so the full
// waitingFor + duration ("permission prompt · 1h 20m" = 156px) clipped at both
// ends — and that reason is the DEFAULT, so the worst case was the common one.
test("shortWait abbreviates the reason so reason + duration fits the key", () => {
  assert.equal(shortWait("permission prompt"), "permission");
  assert.equal(shortWait("sandbox request"), "sandbox");
  assert.equal(shortWait("worker request"), "worker");
  assert.equal(shortWait("input needed"), "input");
  assert.equal(shortWait("dialog open"), "dialog");
  assert.equal(shortWait("Permission Prompt"), "permission"); // case-insensitive
  assert.equal(shortWait("some future reason"), "some future reason"); // pass through
  assert.equal(shortWait(""), "");
  assert.equal(shortWait(null), "");
  // the worst realistic line must stay well inside the key
  assert.ok((shortWait("permission prompt") + " · " + fmtShort(80 * 60_000)).length <= 20);
});

test("waitingSince is statusUpdatedAt only, never the updatedAt fallback", () => {
  // Both keys must measure from the same anchor, and status.js already warns
  // that updatedAt may be a heartbeat on some builds.
  const w = { pid: 1, cwd: "/a/x", sessionId: "s", status: "waiting", waitingFor: "permission prompt", statusUpdatedAt: NOW - 5000, updatedAt: NOW };
  assert.equal(statusEntry(resolveStatusKey([w], "", 0, NOW)).waitingSince, NOW - 5000);
  const noStamp = { pid: 1, cwd: "/a/x", sessionId: "s", status: "waiting", updatedAt: NOW - 9000 };
  assert.equal(statusEntry(resolveStatusKey([noStamp], "", 0, NOW)).waitingSince, null);
  const busy = { pid: 1, cwd: "/a/x", sessionId: "s", status: "busy", statusUpdatedAt: NOW - 5000 };
  assert.equal(statusEntry(resolveStatusKey([busy], "", 0, NOW)).waitingSince, null);
});

// ---------- pidLooksRecycled ----------
// A session file survives a crash, so `process.kill(pid, 0)` alone reports a
// phantom session forever once the OS hands that pid to something else. The
// process that wrote the session file must have existed before the session did,
// so a process younger than its own session is a different process.
// Every uncertain case must return false: hiding a live session is far worse
// than showing a phantom one.

test("pidLooksRecycled: process much younger than the session => recycled", () => {
  const started = 1_000_000_000;
  assert.equal(pidLooksRecycled({ startedAt: started }, started + 3_600_000), true);
});

test("pidLooksRecycled: process older than the session => genuine", () => {
  const started = 1_000_000_000;
  assert.equal(pidLooksRecycled({ startedAt: started }, started - 5_000), false);
});

test("pidLooksRecycled: small positive skew inside the slack window => genuine", () => {
  const started = 1_000_000_000;
  // The session file is written moments after the process starts, so procStart
  // should precede startedAt; slack absorbs clock/rounding noise only.
  assert.equal(pidLooksRecycled({ startedAt: started }, started + 1_000), false);
  assert.equal(pidLooksRecycled({ startedAt: started }, started + 59_000), false);
  assert.equal(pidLooksRecycled({ startedAt: started }, started + 61_000), true);
});

test("pidLooksRecycled fails open when either side is unknown", () => {
  assert.equal(pidLooksRecycled({ startedAt: 0 }, 5_000_000), false);        // no startedAt
  assert.equal(pidLooksRecycled({}, 5_000_000), false);                      // no startedAt
  assert.equal(pidLooksRecycled(null, 5_000_000), false);                    // no session
  assert.equal(pidLooksRecycled({ startedAt: 1 }, null), false);             // pid absent from ps output
  assert.equal(pidLooksRecycled({ startedAt: 1 }, undefined), false);
});
