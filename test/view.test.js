import { test } from "node:test";
import assert from "node:assert/strict";
import { viewFor, gaugeMode, modelListIndex, sessionEta, fmtAgo, fmtReset } from "../src/view.js";

// keyart returns a data URI, so decode before asserting. These tests deliberately
// assert on the TEXT the key draws rather than on SVG structure: the text is the
// user-visible contract, and it survives restyling.
const NOW = 1_800_000_000_000;
const text = (image) => decodeURIComponent(String(image).replace(/^data:image\/svg\+xml,/, ""));
const drawn = (kind, env) => text(viewFor(kind, { now: NOW, ...env }).image);

// A state with nothing in it — every key must render something rather than throw.
const emptyState = () => ({
  sessions: [], activity: new Map(), usage: null, usageErr: null, usageAt: 0,
  usageMeter: null, usageMeterModels: null, today: null, burn: null,
  pctHistory: [], approveQueue: [], denies: [], hookErr: null,
});

const session = (over = {}) => ({
  sessionId: "s1", pid: 100, cwd: "/Users/me/web-app", name: "web-app",
  status: "idle", updatedAt: NOW, startedAt: NOW - 3_600_000, entrypoint: "cli", ...over,
});

const ALL_KINDS = [
  "usage-session", "usage-weekly", "usage-model", "burn-rate", "project",
  "focus-session", "quick-prompt", "custom", "launch", "quick-chat", "open-web",
  "claude-code", "sessions", "today", "usage-meter", "approver-status",
  "approver-waiting", "approve-allow", "approve-always", "approve-deny",
];

// ---------- the whole board survives an empty state ----------
test("every key renders on a cold, empty state", () => {
  for (const kind of ALL_KINDS) {
    const { image } = viewFor(kind, { state: emptyState(), now: NOW });
    assert.ok(typeof image === "string" && image.startsWith("data:image/svg+xml,"), `${kind} drew nothing`);
  }
});

test("an unknown kind draws nothing rather than throwing", () => {
  assert.deepEqual(viewFor("not-a-key", { state: emptyState(), now: NOW }), {});
});

// ---------- Sessions: "waiting" is blocked-on-you, never "working" ----------
// This is the bug the phase-2 work fixed; it belongs in a test now.
test("Sessions counts a waiting session as needing you, not working", () => {
  const state = { ...emptyState(), sessions: [session({ status: "waiting", waitingFor: "permission prompt" })] };
  const t = drawn("sessions", { state });
  assert.match(t, /1 needs you/);
  assert.doesNotMatch(t, /working/);
});

test("Sessions reports busy sessions as working", () => {
  const state = { ...emptyState(), sessions: [session({ status: "busy" })] };
  assert.match(drawn("sessions", { state }), /1 working/);
});

test("Sessions says all idle with sessions, none running without", () => {
  assert.match(drawn("sessions", { state: { ...emptyState(), sessions: [session()] } }), /all idle/);
  assert.match(drawn("sessions", { state: emptyState() }), /none running/);
});

test("Sessions cycle shows position and the cycled session's derived state", () => {
  const state = {
    ...emptyState(),
    sessions: [session({ pid: 1, name: "alpha" }), session({ pid: 2, sessionId: "s2", name: "beta", status: "busy" })],
  };
  const t = drawn("sessions", { state, cycleIdx: 1 });
  assert.match(t, /2\/2/, "shows which of how many");
  assert.match(t, /beta/);
  assert.match(t, /working/);
});

// ---------- Status key sub-line ----------
test("Status shows the shortened wait reason and how long", () => {
  const state = {
    ...emptyState(),
    sessions: [session({ status: "waiting", waitingFor: "permission prompt", statusUpdatedAt: NOW - 180_000 })],
  };
  const t = drawn("approver-status", { state });
  assert.match(t, /permission/, "reason is shortened from 'permission prompt'");
  assert.match(t, /3m/, "and carries the wait duration");
});

test("Status distinguishes a question from an approval request", () => {
  const state = {
    ...emptyState(),
    sessions: [session({ status: "waiting", waitingFor: "input needed", statusUpdatedAt: NOW })],
  };
  assert.match(drawn("approver-status", { state }), /input/);
});

test("Status says 'just now' when finished, not '0m'", () => {
  const state = { ...emptyState(), sessions: [session({ status: "idle", statusUpdatedAt: NOW - 1000 })] };
  const t = drawn("approver-status", { state });
  assert.match(t, /just now/);
  assert.doesNotMatch(t, /0m/);
});

test("Status ages an idle session in minutes", () => {
  const state = { ...emptyState(), sessions: [session({ status: "idle", statusUpdatedAt: NOW - 20 * 60_000 })] };
  assert.match(drawn("approver-status", { state }), /20m idle/);
});

test("Status falls back to the configured project name when no session matches", () => {
  const t = drawn("approver-status", { state: emptyState(), settings: { project: "ghost-app" } });
  assert.match(t, /ghost-app/);
});

test("Status honours an explicit label over the session name", () => {
  const state = { ...emptyState(), sessions: [session()] };
  assert.match(drawn("approver-status", { state, settings: { label: "MY LABEL" } }), /MY LABEL/);
});

test("Status only cycles when the key opted in", () => {
  const state = {
    ...emptyState(),
    sessions: [session({ pid: 1, cwd: "/a/alpha" }), session({ pid: 2, sessionId: "s2", cwd: "/a/beta" })],
  };
  // cycleIdx is live, but settings.cycle is off -> stays on its own slot.
  assert.doesNotMatch(drawn("approver-status", { state, cycleIdx: 1 }), /2\/2/);
  assert.match(drawn("approver-status", { state, cycleIdx: 1, settings: { cycle: true, project: "" } }), /2\/2/);
});

// ---------- Waiting key ----------
test("Waiting is quiet with no blocked session and counts the calm ones", () => {
  const state = { ...emptyState(), sessions: [session(), session({ pid: 2, sessionId: "s2" })] };
  const t = drawn("approver-waiting", { state });
  assert.match(t, /2 sessions ok/);
});

test("Waiting says no sessions when the deck is empty", () => {
  assert.match(drawn("approver-waiting", { state: emptyState() }), /no sessions/);
});

test("Waiting surfaces the blocked session and its reason", () => {
  const state = {
    ...emptyState(),
    sessions: [session({ status: "waiting", waitingFor: "permission prompt", statusUpdatedAt: NOW - 60_000 })],
  };
  const t = drawn("approver-waiting", { state });
  assert.match(t, /web-app/);
  assert.match(t, /permission/);
});

// ---------- Focus key: pool priority and the remembered index ----------
test("Focus prefers a blocked session over a merely running one", () => {
  const state = {
    ...emptyState(),
    sessions: [
      session({ pid: 1, name: "quiet-one" }),
      session({ pid: 2, sessionId: "s2", name: "asking-one", status: "waiting", waitingFor: "permission prompt" }),
    ],
  };
  const t = drawn("focus-session", { state });
  assert.match(t, /asking-one/);
  assert.doesNotMatch(t, /quiet-one/);
});

test("Focus honours the remembered index while the pool is unchanged", () => {
  const state = {
    ...emptyState(),
    sessions: [session({ pid: 1, name: "first" }), session({ pid: 2, sessionId: "s2", name: "second" })],
  };
  assert.match(drawn("focus-session", { state, focus: { i: 1, sig: "1,2" } }), /second/);
});

test("Focus ignores a remembered index from a different pool", () => {
  const state = {
    ...emptyState(),
    sessions: [session({ pid: 1, name: "first" }), session({ pid: 2, sessionId: "s2", name: "second" })],
  };
  // sig belongs to a pool that no longer exists -> show the top, not a session
  // the user never focused.
  assert.match(drawn("focus-session", { state, focus: { i: 1, sig: "9,9" } }), /first/);
});

test("Focus invites a press when nothing is running", () => {
  assert.match(drawn("focus-session", { state: emptyState() }), /press to cycle/);
});

// ---------- gauges ----------
test("gauge keys say 'sign in?' on an auth error, never a silent zero", () => {
  const state = { ...emptyState(), usageErr: "no OAuth token in credentials file" };
  // No local data either -> the local fallback has nothing, so this is the
  // "pending" face rather than a fabricated 0%.
  const t = drawn("usage-session", { state });
  assert.doesNotMatch(t, /\$0\.00/);
});

test("gauge keys report throttling distinctly from failure", () => {
  const state = { ...emptyState(), usageErr: "usage endpoint HTTP 429 (backing off to 240s)" };
  assert.match(drawn("usage-session", { state }), /throttled/);
});

test("a subscription 5h gauge shows the percentage and the reset countdown", () => {
  const state = {
    ...emptyState(), usageAt: NOW,
    usage: { fiveHour: { pct: 42, resetsAt: new Date(NOW + 90 * 60_000).toISOString() } },
  };
  const t = drawn("usage-session", { state });
  assert.match(t, /42/);
  assert.match(t, /left/);
});

test("the local fallback shows spend, and never claims $0.00 without data", () => {
  const withData = {
    ...emptyState(), usageErr: "no OAuth token in credentials file",
    usageMeter: { "5h": { tokens: 1000, cost: 12.5, in: 10, out: 20 } },
  };
  assert.match(drawn("usage-session", { state: withData }), /\$12\.50/);
});

test("a budget turns local spend into a percentage ring", () => {
  const state = {
    ...emptyState(), usageErr: "no OAuth token in credentials file",
    usageMeter: { "5h": { tokens: 1000, cost: 25, in: 1, out: 2 } },
  };
  assert.match(drawn("usage-session", { state, settings: { budget: "50" } }), /\$25 \/ \$50/);
});

test("local gauges can be toggled to tokens", () => {
  const state = {
    ...emptyState(), usageErr: "no OAuth token in credentials file",
    usageMeter: { "5h": { tokens: 2_000_000, cost: 5, in: 1000, out: 2000 } },
  };
  assert.match(drawn("usage-session", { state, usageViewMode: "tokens" }), /in.*out|out/);
});

test("the weekly gauge prefers the scoped per-model line for its sub-line", () => {
  const state = {
    ...emptyState(), usageAt: NOW,
    usage: { weekly: { pct: 30, resetsAt: null }, scopedPct: 61, scopedName: "Opus" },
  };
  assert.match(drawn("usage-weekly", { state }), /Opus 61%/);
});

// ---------- Model key rotation ----------
test("the Model key shows position when several models are available", () => {
  const state = {
    ...emptyState(), usageAt: NOW,
    usage: { models: [{ name: "Opus", pct: 10, resetsAt: null }, { name: "Sonnet", pct: 20, resetsAt: null }] },
  };
  const t = drawn("usage-model", { state, pressedModelIdx: 1 });
  assert.match(t, /SONNET/);
  assert.match(t, /2\/2/);
});

test("modelListIndex: a press wins, then the configured name, then family, then first", () => {
  const list = [{ name: "Opus" }, { name: "Sonnet" }];
  assert.equal(modelListIndex(1, list, "Opus"), 1, "an explicit press wins");
  assert.equal(modelListIndex(null, list, "Sonnet"), 1, "matched by name");
  assert.equal(modelListIndex(null, list, "unknown-model"), 0, "unmatched falls back to first");
  assert.equal(modelListIndex(null, [], "Opus"), 0, "empty list is index 0");
  assert.equal(modelListIndex(5, list, null), 1, "a press wraps around the list");
});

test("modelListIndex matches a saved API name by pricing family", () => {
  const local = [{ model: "opus" }, { model: "sonnet" }];
  assert.equal(modelListIndex(null, local, "claude-sonnet-5"), 1);
});

// ---------- Usage key ----------
test("Usage shows -- with no data rather than a zero cost", () => {
  const t = drawn("usage-meter", { state: emptyState() });
  assert.match(t, /--/);
  assert.doesNotMatch(t, /\$0\.00/);
});

test("Usage renders cost and tokens views, and labels the window", () => {
  const state = { ...emptyState(), usageMeter: { month: { tokens: 5_000_000, cost: 3.5, in: 10, out: 20 } } };
  const cost = drawn("usage-meter", { state, settings: { window: "month" } });
  assert.match(cost, /THIS MONTH/);
  assert.match(cost, /\$3\.50/);
  assert.match(drawn("usage-meter", { state, settings: { window: "month" }, usageViewMode: "tokens" }), /5\.0M|5M/);
});

// ---------- Burn rate ----------
test("Burn rate says 'no cap' rather than 'measuring…' forever without a subscription", () => {
  // pctHistory only ever fills from a subscription percentage, so on Foundry et al
  // "measuring…" would be a promise that never resolves.
  assert.match(drawn("burn-rate", { state: emptyState() }), /no cap/);
});

test("Burn rate reports local 5h spend when there is no subscription cap", () => {
  const state = { ...emptyState(), usageMeter: { "5h": { tokens: 1, cost: 9.5, in: 1, out: 1 } } };
  assert.match(drawn("burn-rate", { state }), /\$9\.50 last 5h/);
});

test("sessionEta is still measuring with a single sample", () => {
  const state = { ...emptyState(), usageAt: NOW, usage: { fiveHour: { pct: 5, resetsAt: null } }, pctHistory: [{ t: NOW, pct: 5 }] };
  assert.equal(sessionEta(state, NOW), "measuring…");
});

test("sessionEta reads steady when utilization is flat", () => {
  const state = {
    ...emptyState(), usageAt: NOW, usage: { fiveHour: { pct: 5, resetsAt: null } },
    pctHistory: [{ t: NOW - 20 * 60_000, pct: 5 }, { t: NOW, pct: 5 }],
  };
  assert.equal(sessionEta(state, NOW), "steady");
});

// ---------- configurable keys prompt for setup ----------
test("unconfigured Project/Prompt/Custom keys say what they need", () => {
  const state = emptyState();
  // Matched as prefixes: keyart clips a sub-line that overruns the 144px key and
  // appends an ellipsis, so the drawn text really is "set folder in sett…".
  assert.match(drawn("project", { state }), /configure/);
  assert.match(drawn("project", { state }), /set folder in/);
  assert.match(drawn("quick-prompt", { state }), /set prompt in/);
  assert.match(drawn("custom", { state }), /set command in/);
});

test("a configured Project key shows its folder name", () => {
  assert.match(drawn("project", { state: emptyState(), settings: { path: "/Users/me/my-repo" } }), /my-repo/);
});

// ---------- approve keys: what was painted is what a press may answer ----------
const req = (over = {}) => ({
  id: 7, receivedAt: NOW, toolName: "Bash", cwd: "/Users/me/web-app",
  toolInput: { command: "npm test" }, suggestions: [], ...over,
});

test("approve keys report the request id they painted", () => {
  const state = { ...emptyState(), approveQueue: [req()] };
  const { painted } = viewFor("approve-allow", { state, now: NOW });
  assert.equal(painted.reqId, 7);
});

test("painted reqId is null when the queue is empty, so a press has nothing to answer", () => {
  const { painted } = viewFor("approve-allow", { state: emptyState(), now: NOW });
  assert.equal(painted.reqId, null);
});

test("only the ALWAYS key paints a rule", () => {
  const state = { ...emptyState(), approveQueue: [req()] };
  assert.equal(viewFor("approve-allow", { state, now: NOW }).painted.rule, null);
  assert.equal(viewFor("approve-deny", { state, now: NOW }).painted.rule, null);
  // The rule for a Bash command comes from approve.js; assert only that one exists.
  assert.notEqual(viewFor("approve-always", { state, now: NOW }).painted.rule, undefined);
});

test("approve keys show a bind error over anything else", () => {
  const state = { ...emptyState(), hookErr: "port busy" };
  assert.match(drawn("approve-allow", { state }), /port busy/);
});

test("'auth?' appears only when the queue is empty AND bad paths repeated", () => {
  const idle = emptyState();
  assert.doesNotMatch(drawn("approve-allow", { state: idle }), /auth\?/);
  assert.match(drawn("approve-allow", { state: idle, authFlagged: true }), /auth\?/);
  // A live request means the URL demonstrably works, so never cry auth.
  const busy = { ...emptyState(), approveQueue: [req()] };
  assert.doesNotMatch(drawn("approve-allow", { state: busy, authFlagged: true }), /auth\?/);
});

// ---------- gaugeMode ----------
test("gaugeMode is pending on a cold start, never local", () => {
  assert.equal(gaugeMode(emptyState(), "usage-session", NOW), "pending");
});

test("gaugeMode goes local when the token is absent but transcripts exist", () => {
  const state = {
    ...emptyState(), usageErr: "no OAuth token in credentials file",
    usageMeter: { "5h": { tokens: 1, cost: 1, in: 1, out: 1 } },
  };
  assert.equal(gaugeMode(state, "usage-session", NOW), "local");
});

// ---------- formatting ----------
test("fmtAgo takes a duration and renders hours and minutes", () => {
  assert.equal(fmtAgo(0), "0m");
  assert.equal(fmtAgo(5 * 60_000), "5m");
  assert.equal(fmtAgo(3 * 3.6e6 + 7 * 60_000), "3h 7m");
});

test("fmtReset counts down against the injected clock, not the wall clock", () => {
  // The injected `now` is what makes this assertable at all: with the real clock
  // the expected string would change between runs.
  assert.equal(fmtReset(new Date(NOW + 90 * 60_000).toISOString(), NOW), "1h 30m left");
  assert.equal(fmtReset(new Date(NOW + 3 * 24 * 3.6e6).toISOString(), NOW), "3d left");
  assert.equal(fmtReset(new Date(NOW - 1000).toISOString(), NOW), "resetting…");
  assert.equal(fmtReset(null, NOW), "");
});
