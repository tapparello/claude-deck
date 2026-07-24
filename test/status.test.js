import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveStatusKey, statusEntry, sessionProject, autoOrdinal } from "../src/status.js";

const S = (over) => ({ sessionId: "x", cwd: "/Users/me/web-app", status: "idle", updatedAt: 1, pid: 100, ...over });

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
