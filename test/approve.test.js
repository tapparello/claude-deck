import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeSuggestions, decisionBody, DENY_MESSAGE, hookFragment } from "../src/approve.js";

const addRules = (over = {}) => ({
  type: "addRules",
  destination: "localSettings",
  behavior: "allow",
  rules: [{ toolName: "WebFetch", ruleContent: "domain:example.com" }],
  ...over,
});

test("sanitize keeps a well-formed addRules/allow suggestion", () => {
  const out = sanitizeSuggestions([addRules()], "WebFetch");
  assert.equal(out.length, 1);
  assert.equal(out[0].type, "addRules");
  assert.equal(out[0].destination, "localSettings");
  assert.deepEqual(out[0].rules, [{ toolName: "WebFetch", ruleContent: "domain:example.com" }]);
});

test("sanitize drops every suggestion type except addRules", () => {
  for (const type of ["removeRules", "replaceRules", "setMode", "addDirectories", "removeDirectories"]) {
    assert.deepEqual(sanitizeSuggestions([addRules({ type })], "Read"), [], type);
  }
  // a mode setter carries no rules at all
  assert.deepEqual(
    sanitizeSuggestions([{ type: "setMode", mode: "acceptEdits", destination: "localSettings" }], "Edit"),
    [],
  );
  // and a directory grant carries `directories`, not `rules`
  assert.deepEqual(
    sanitizeSuggestions([{ type: "addDirectories", directories: ["/"], destination: "localSettings" }], "Read"),
    [],
  );
});

test("sanitize drops behaviors other than allow", () => {
  for (const behavior of ["deny", "ask", undefined]) {
    assert.deepEqual(sanitizeSuggestions([addRules({ behavior })], "WebFetch"), [], String(behavior));
  }
});

test("sanitize drops whole-tool rules that carry no ruleContent", () => {
  const whole = addRules({ rules: [{ toolName: "mcp__azure-devops__x" }] });
  assert.deepEqual(sanitizeSuggestions([whole], "Bash"), []);
  assert.deepEqual(sanitizeSuggestions([addRules({ rules: [{ toolName: "Bash", ruleContent: "" }] })], "Bash"), []);
  assert.deepEqual(sanitizeSuggestions([addRules({ rules: [{ ruleContent: "x" }] })], "Bash"), []);
});

test("sanitize keeps only the well-formed rules inside a mixed entry", () => {
  const mixed = addRules({
    rules: [{ toolName: "Bash", ruleContent: "npm test" }, { toolName: "Bash" }],
  });
  const out = sanitizeSuggestions([mixed], "Bash");
  assert.deepEqual(out[0].rules, [{ toolName: "Bash", ruleContent: "npm test" }]);
});

test("sanitize never widens a session destination", () => {
  const out = sanitizeSuggestions([addRules({ destination: "session" })], "WebFetch");
  assert.equal(out[0].destination, "session");
});

test("sanitize clamps every wider destination down to localSettings", () => {
  for (const destination of ["userSettings", "projectSettings", "cliArg", "nonsense", undefined]) {
    const out = sanitizeSuggestions([addRules({ destination })], "WebFetch");
    assert.equal(out[0].destination, "localSettings", String(destination));
  }
});

test("sanitize forces session when sessionOnly is set", () => {
  const out = sanitizeSuggestions([addRules({ destination: "userSettings" })], "WebFetch", true);
  assert.equal(out[0].destination, "session");
});

test("sanitize always refuses mcp__ tools", () => {
  assert.deepEqual(sanitizeSuggestions([addRules()], "mcp__azure-devops__wit_get_work_item"), []);
  assert.deepEqual(sanitizeSuggestions([addRules()], "mcp__x__y", true), []);
});

test("sanitize tolerates junk input without throwing", () => {
  for (const junk of [undefined, null, "x", 42, {}, [null], [undefined], [{}], [[]]]) {
    assert.deepEqual(sanitizeSuggestions(junk, "Bash"), [], JSON.stringify(junk) ?? "undefined");
  }
});

test("INVARIANT: no input can produce a forbidden type or destination", () => {
  const types = ["addRules", "removeRules", "replaceRules", "setMode", "addDirectories", "removeDirectories", "x"];
  const dests = ["userSettings", "projectSettings", "localSettings", "session", "cliArg", "weird", undefined];
  const behaviors = ["allow", "deny", "ask", undefined];
  for (const type of types) for (const destination of dests) for (const behavior of behaviors) {
    for (const sessionOnly of [false, true]) {
      // Sibling fields are deliberately present: a refactor to `{...e, destination}`
      // would leak them, and this assertion is what catches that.
      const out = sanitizeSuggestions([{
        type, destination, behavior, rules: [{ toolName: "Bash", ruleContent: "x" }],
        mode: "acceptEdits", directories: ["/"], extra: { nested: true },
      }], "Bash", sessionOnly);
      for (const e of out) {
        assert.equal(e.type, "addRules");
        assert.ok(e.destination === "localSettings" || e.destination === "session", e.destination);
        assert.equal(e.behavior, "allow");
        assert.deepEqual(Object.keys(e).sort(), ["behavior", "destination", "rules", "type"]);
      }
    }
  }
});

test("INVARIANT: rule objects never leak sibling fields", () => {
  // A refactor of the rule-mapping step from `.map((r) => ({ toolName: r.toolName, ruleContent: r.ruleContent }))`
  // to `.map((r) => ({...r}))` would leak extra keys. This test ensures rule objects carry only exactly
  // the two expected keys, even when the input rule carries sibling fields like `evil: "leak"`.
  const out = sanitizeSuggestions([{
    type: "addRules",
    behavior: "allow",
    destination: "localSettings",
    rules: [
      { toolName: "Bash", ruleContent: "npm test", evil: "leak", extra: "field" },
      { toolName: "Read", ruleContent: "path", nested: { object: true } },
    ],
  }], "Bash");
  assert.equal(out.length, 1);
  assert.equal(out[0].rules.length, 2);
  for (const rule of out[0].rules) {
    assert.deepEqual(Object.keys(rule).sort(), ["ruleContent", "toolName"]);
  }
});

test("decisionBody: allow", () => {
  assert.deepEqual(decisionBody("allow", { toolName: "Bash", suggestions: [] }), {
    hookSpecificOutput: { hookEventName: "PermissionRequest", decision: { behavior: "allow" } },
  });
});

test("decisionBody: deny carries a fixed message and no interrupt", () => {
  const body = decisionBody("deny", { toolName: "Bash", suggestions: [] });
  assert.deepEqual(body.hookSpecificOutput.decision, { behavior: "deny", message: DENY_MESSAGE });
  assert.equal("interrupt" in body.hookSpecificOutput.decision, false);
});

test("decisionBody: always attaches sanitised updatedPermissions", () => {
  const req = { toolName: "WebFetch", suggestions: [addRules({ destination: "userSettings" })] };
  const body = decisionBody("always", req);
  assert.equal(body.hookSpecificOutput.decision.behavior, "allow");
  assert.equal(body.hookSpecificOutput.decision.updatedPermissions[0].destination, "localSettings");
});

test("decisionBody: always returns null when nothing survives sanitising", () => {
  assert.equal(decisionBody("always", { toolName: "Bash", suggestions: [] }), null);
  assert.equal(decisionBody("always", { toolName: "Bash", suggestions: [addRules({ type: "setMode" })] }), null);
  // never degrade into a bare allow
  assert.equal(decisionBody("always", { toolName: "mcp__x__y", suggestions: [addRules()] }), null);
});

test("decisionBody: always returns null for an AMBIGUOUS set", () => {
  // The key renders "ALWAYS n/a" in exactly these cases; the decision must agree,
  // or a greyed-out key would still persist rules.
  const two = [addRules({ rules: [{ toolName: "Bash", ruleContent: "a" }] }),
               addRules({ rules: [{ toolName: "Bash", ruleContent: "b" }] })];
  assert.equal(decisionBody("always", { toolName: "Bash", suggestions: two }), null, "two entries");
  const twoRules = addRules({ rules: [{ toolName: "Bash", ruleContent: "a" }, { toolName: "Bash", ruleContent: "b" }] });
  assert.equal(decisionBody("always", { toolName: "Bash", suggestions: [twoRules] }), null, "two rules");
});

test("decisionBody: always emits EXACTLY one update entry, with no extra keys", () => {
  const body = decisionBody("always", { toolName: "WebFetch", suggestions: [addRules()] });
  const ups = body.hookSpecificOutput.decision.updatedPermissions;
  assert.equal(ups.length, 1);
  assert.deepEqual(Object.keys(ups[0]).sort(), ["behavior", "destination", "rules", "type"]);
});

test("decisionBody: unknown kind returns null", () => {
  assert.equal(decisionBody("nope", { toolName: "Bash", suggestions: [] }), null);
});

import { describeRequest, alwaysRule, TARGET_MAX, RULE_FIT } from "../src/approve.js";

const req = (over = {}) => ({ cwd: "/Users/x/dev/claude-deck", toolName: "Bash", toolInput: { command: "npm test" }, suggestions: [], ...over });

test("describeRequest names the project from cwd", () => {
  assert.equal(describeRequest(req()).name, "claude-deck");
  // 11-char cap: basename is truncated, not ellipsised away
  assert.equal(describeRequest(req({ cwd: "/a/fmf_connect_flutter" })).name.length, 11);
  assert.equal(describeRequest(req({ cwd: undefined })).name, "");
});

test("describeRequest names the project from a Windows-style cwd", () => {
  // The only Windows-specific line in the new approver code, and CI runs windows-latest.
  assert.equal(describeRequest(req({ cwd: "C:\\Users\\x\\proj" })).name, "proj");
});

test("describeRequest maps each tool to a target", () => {
  const cases = [
    [{ toolName: "Bash", toolInput: { command: "npm test" } }, "npm test"],
    [{ toolName: "Edit", toolInput: { file_path: "/a/b/plugin.js" } }, "plugin.js"],
    [{ toolName: "Write", toolInput: { file_path: "/a/b/notes.md" } }, "notes.md"],
    [{ toolName: "NotebookEdit", toolInput: { file_path: "/a/n.ipynb" } }, "n.ipynb"],
    [{ toolName: "Read", toolInput: { file_path: "/a/b/x.txt" } }, "x.txt"],
    [{ toolName: "WebFetch", toolInput: { url: "https://example.com/a/b" } }, "example.com"],
    [{ toolName: "WebSearch", toolInput: { query: "node http" } }, "node http"],
    [{ toolName: "Task", toolInput: { subagent_type: "Explore" } }, "Explore"],
    [{ toolName: "mcp__azdo__wit_get", toolInput: {} }, "azdo·wit_get"],
    [{ toolName: "SomethingNew", toolInput: {} }, "SomethingNew"],
  ];
  for (const [over, want] of cases) assert.equal(describeRequest(req(over)).target, want, over.toolName);
});

test("describeRequest collapses whitespace and control chars in EVERY branch", () => {
  assert.equal(describeRequest(req({ toolName: "Bash", toolInput: { command: "npm\n  test\t-v" } })).target, "npm test -v");
  assert.equal(describeRequest(req({ toolName: "WebSearch", toolInput: { query: "a\nb" } })).target, "a b");
  // hyphens must SURVIVE - `claude-deck` and `--admin` are not whitespace
  assert.equal(describeRequest(req({ cwd: "/a/claude-deck" })).name, "claude-deck");
  assert.equal(describeRequest(req({ toolName: "Task", toolInput: { subagent_type: "a" + String.fromCharCode(1) + "b" } })).target, "a b");
});

test("describeRequest preserves hyphens in names and targets", () => {
  assert.equal(describeRequest(req({ cwd: "/a/claude-deck" })).name, "claude-deck");
  assert.equal(describeRequest(req({ toolName: "Bash", toolInput: { command: "x --flag" } })).target, "x --flag");
});

test("describeRequest truncates the target with an ellipsis", () => {
  const t = describeRequest(req({ toolInput: { command: "gh pr merge --admin 1234" } })).target;
  assert.equal(t.length, TARGET_MAX);
  assert.ok(t.endsWith("…"), t);
});

test("describeRequest falls back to the tool name on malformed input", () => {
  for (const bad of [undefined, null, "str", 42, {}]) {
    assert.equal(describeRequest(req({ toolInput: bad })).target, "Bash", JSON.stringify(bad) ?? "undefined");
  }
  assert.equal(describeRequest(req({ toolName: "WebFetch", toolInput: { url: "not a url" } })).target, "WebFetch");
  assert.equal(describeRequest({}).target, "");
  assert.doesNotThrow(() => describeRequest(undefined));
});

const sugg = (ruleContent, toolName = "Bash", over = {}) => ({
  type: "addRules", behavior: "allow", destination: "localSettings",
  rules: [{ toolName, ruleContent }], ...over,
});

test("alwaysRule renders the rule that would be persisted, not the command", () => {
  const r = req({ toolName: "Bash", toolInput: { command: "gh pr merge --admin 1234" }, suggestions: [sugg("gh pr *")] });
  assert.equal(alwaysRule(r), "Bash(gh pr *)");
});

test("alwaysRule returns null when nothing survives sanitising", () => {
  assert.equal(alwaysRule(req({ suggestions: [] })), null);
  assert.equal(alwaysRule(req({ suggestions: [sugg("x", "Bash", { type: "setMode" })] })), null);
  assert.equal(alwaysRule(req({ toolName: "mcp__a__b", suggestions: [sugg("x")] })), null);
});

test("alwaysRule returns null when the surviving set is ambiguous", () => {
  assert.equal(alwaysRule(req({ suggestions: [sugg("a"), sugg("b")] })), null, "two entries");
  const twoRules = { type: "addRules", behavior: "allow", destination: "localSettings",
    rules: [{ toolName: "Bash", ruleContent: "a" }, { toolName: "Bash", ruleContent: "b" }] };
  assert.equal(alwaysRule(req({ suggestions: [twoRules] })), null, "two rules");
});

test("alwaysRule renders two different WebFetch domain rules legibly instead of identically", () => {
  // Before this fix, RULE_MAX(18)-truncation collapsed BOTH of these to the
  // identical "WebFetch(domain:e…" — the one key that produces a durable write
  // could not distinguish a legit domain from an attacker's.
  const example = alwaysRule(req({ toolName: "WebFetch", suggestions: [sugg("domain:example.com", "WebFetch")] }));
  const evil = alwaysRule(req({ toolName: "WebFetch", suggestions: [sugg("domain:evil.com", "WebFetch")] }));
  assert.equal(example, "WebFetch(domain:example.com)");
  assert.equal(evil, "WebFetch(domain:evil.com)");
  assert.notEqual(example, evil);
  assert.ok(!example.endsWith("…") && !evil.endsWith("…"), "must be the full text, not a shared truncated prefix");
});

test("alwaysRule returns the rule text WHOLE when it lands exactly at RULE_FIT", () => {
  const toolName = "T";
  const ruleContent = "x".repeat(RULE_FIT - toolName.length - 2); // -2 for the parens
  const r = req({ toolName, suggestions: [sugg(ruleContent, toolName)] });
  const out = alwaysRule(r);
  assert.equal(out, `${toolName}(${ruleContent})`);
  assert.equal(out.length, RULE_FIT);
});

test("alwaysRule refuses (returns null) one character past RULE_FIT", () => {
  // A rule too long to show honestly must not be pressable — the honest failure
  // mode is the disabled ALWAYS n/a state, not a misleading truncation.
  const toolName = "T";
  const ruleContent = "x".repeat(RULE_FIT - toolName.length - 2 + 1);
  const r = req({ toolName, suggestions: [sugg(ruleContent, toolName)] });
  assert.equal(alwaysRule(r), null);
});

import { enqueue, head, resolve, expiredIds, staleIds, seedBaselines, QUEUE_MAX, YOUNG_MS, HOLD_S_DEFAULT } from "../src/approve.js";

const entry = (id, over = {}) => ({
  id, receivedAt: 1000, sessionId: "s1",
  cwd: "/a/proj", toolName: "Bash", toolInput: { command: "x" }, suggestions: [],
  statusSnapshot: 500, activitySnapshot: null, baselined: true, ...over,
});
const fill = (n) => { let q = []; for (let i = 1; i <= n; i++) q = enqueue(q, entry(i)).queue; return q; };

test("queue is FIFO and head is the oldest", () => {
  const q = fill(3);
  assert.deepEqual(q.map((r) => r.id), [1, 2, 3]);
  assert.equal(head(q).id, 1);
  assert.equal(head([]), null);
});

test("enqueue at QUEUE_MAX evicts the oldest and reports it", () => {
  const full = fill(QUEUE_MAX);
  const { queue, evicted } = enqueue(full, entry(99));
  assert.equal(queue.length, QUEUE_MAX);
  assert.equal(evicted.id, 1, "oldest is evicted, not the newest refused");
  assert.equal(head(queue).id, 2);
  assert.equal(queue.at(-1).id, 99);
});

test("enqueue below the cap evicts nothing", () => {
  assert.equal(enqueue(fill(2), entry(3)).evicted, null);
});

test("resolve returns the entry once and only once", () => {
  const q = fill(2);
  const first = resolve(q, 1);
  assert.equal(first.req.id, 1);
  assert.deepEqual(first.queue.map((r) => r.id), [2]);
  const second = resolve(first.queue, 1);
  assert.equal(second.req, null, "resolved-guard: a second press sends nothing");
  assert.deepEqual(second.queue.map((r) => r.id), [2]);
});

test("resolve of an unknown id is a no-op", () => {
  const q = fill(1);
  const r = resolve(q, 42);
  assert.equal(r.req, null);
  assert.equal(r.queue.length, 1);
});

test("expiredIds respects the hold window from both sides", () => {
  const holdMs = HOLD_S_DEFAULT * 1000;
  const q = [entry(1, { receivedAt: 0 })];
  assert.deepEqual(expiredIds(q, holdMs - 1, holdMs), []);
  assert.deepEqual(expiredIds(q, holdMs + 1, holdMs), [1]);
});

const sess = (over = {}) => ({ sessionId: "s1", pid: 1, status: "waiting", statusUpdatedAt: 500, cwd: "/a/proj", ...over });
const NOW = 1000 + YOUNG_MS + 1;

test("staleIds drops when statusUpdatedAt advanced past the snapshot", () => {
  assert.deepEqual(staleIds(fill(1), [sess({ statusUpdatedAt: 900 })], new Map(), NOW), [1]);
});

test("staleIds keeps a request whose session has not moved on", () => {
  assert.deepEqual(staleIds(fill(1), [sess({ statusUpdatedAt: 500 })], new Map(), NOW), []);
});

test("staleIds NEVER drops a request younger than YOUNG_MS", () => {
  const q = [entry(1, { receivedAt: 1000 })];
  const moved = [sess({ statusUpdatedAt: 999_999 })];
  assert.deepEqual(staleIds(q, moved, new Map(), 1000 + YOUNG_MS - 1), [], "inside the young window");
  assert.deepEqual(staleIds(q, moved, new Map(), 1000 + YOUNG_MS + 1), [1], "outside it");
});

test("staleIds does not drop when the session is invisible to the poller", () => {
  // VS Code sessions and id mismatches must not look like 'answered'
  assert.deepEqual(staleIds(fill(1), [], new Map(), NOW), []);
});

test("staleIds uses transcript activity for sessions that report no status", () => {
  const q = [entry(1, { statusSnapshot: null, activitySnapshot: 700 })];
  const noStatus = [sess({ status: undefined, statusUpdatedAt: undefined })];
  assert.deepEqual(staleIds(q, noStatus, new Map([["s1", 700]]), NOW), [], "mtime unchanged");
  assert.deepEqual(staleIds(q, noStatus, new Map([["s1", 800]]), NOW), [1], "mtime advanced");
});

test("staleIds resolves a duplicate sessionId by newest statusUpdatedAt", () => {
  // Two live pids share one sessionId after a resume: the stale twin sits at
  // `waiting` forever, so reading it would pin a dead request in the queue.
  const twins = [sess({ pid: 1, statusUpdatedAt: 500 }), sess({ pid: 2, statusUpdatedAt: 900 })];
  assert.deepEqual(staleIds(fill(1), twins, new Map(), NOW), [1]);
  assert.deepEqual(staleIds(fill(1), twins.slice().reverse(), new Map(), NOW), [1], "order independent");
});

test("staleIds drops when waitingFor changed but status stayed waiting", () => {
  const moved = [sess({ waitingFor: "dialog open", statusUpdatedAt: 900 })];
  assert.deepEqual(staleIds(fill(1), moved, new Map(), NOW), [1]);
});

test("staleIds ignores a request with no observed baseline yet", () => {
  const fresh = [entry(1, { baselined: false, statusSnapshot: null })];
  assert.deepEqual(staleIds(fresh, [sess({ statusUpdatedAt: 999_999 })], new Map(), NOW), []);
});

test("seedBaselines records the CURRENT status/mtime and marks the entry baselined", () => {
  const fresh = [entry(1, { baselined: false, statusSnapshot: null, activitySnapshot: null })];
  const out = seedBaselines(fresh, [sess({ statusUpdatedAt: 900 })], new Map([["s1", 800]]));
  assert.equal(out[0].baselined, true);
  assert.equal(out[0].statusSnapshot, 900);
  assert.equal(out[0].activitySnapshot, 800);
  // and now it is NOT stale against the same session it was seeded from
  assert.deepEqual(staleIds(out, [sess({ statusUpdatedAt: 900 })], new Map([["s1", 800]]), NOW), []);
  // but it IS once that session moves on again
  assert.deepEqual(staleIds(out, [sess({ statusUpdatedAt: 901 })], new Map([["s1", 800]]), NOW), [1]);
});

test("seedBaselines leaves already-baselined entries untouched and is a no-op when none are new", () => {
  const done = fill(2);
  assert.equal(seedBaselines(done, [sess()], new Map()), done, "same reference, no churn");
});

test("seedBaselines tolerates a session the poller cannot see", () => {
  const fresh = [entry(1, { baselined: false, statusSnapshot: null })];
  const out = seedBaselines(fresh, [], new Map());
  assert.equal(out[0].baselined, true);
  assert.equal(out[0].statusSnapshot, null);
  // an invisible session must never look 'answered'
  assert.deepEqual(staleIds(out, [], new Map(), NOW), []);
});

import { pressDecision, SETTLE_MS } from "../src/approve.js";

const q1 = () => [entry(1), entry(2, { id: 2 })];

test("pressDecision resolves the painted head", () => {
  const d = pressDecision({ queue: q1(), shownId: 1, lastHeadChangeAt: 0, now: 10_000 });
  assert.deepEqual(d, { action: "resolve", id: 1, reason: "ok" });
});

test("pressDecision does nothing on an empty queue", () => {
  assert.equal(pressDecision({ queue: [], shownId: null, lastHeadChangeAt: 0, now: 10_000 }).action, "none");
});

test("pressDecision ALERTS when the head is not what was painted", () => {
  // key still showed request 1; request 2 became head between paint and press
  const d = pressDecision({ queue: [entry(2, { id: 2 })], shownId: 1, lastHeadChangeAt: 0, now: 10_000 });
  assert.equal(d.action, "alert");
  assert.equal(d.reason, "stale-paint");
});

test("pressDecision ignores a press inside the settle window", () => {
  // no showOk means double-tapping is expected human behaviour
  const d = pressDecision({ queue: q1(), shownId: 1, lastHeadChangeAt: 9_800, now: 10_000 });
  assert.equal(d.action, "none");
  assert.equal(d.reason, "settling");
  const after = pressDecision({ queue: q1(), shownId: 1, lastHeadChangeAt: 10_000 - SETTLE_MS - 1, now: 10_000 });
  assert.equal(after.action, "resolve");
});

test("pressDecision alerts when the key painted nothing but a request now exists", () => {
  assert.equal(pressDecision({ queue: q1(), shownId: null, lastHeadChangeAt: 0, now: 10_000 }).action, "alert");
});

// Regression guard for the Task 9 review finding: installSnippet()/hookFragment() must
// return pure JSON with no `//` comments, because the Property Inspector's Copy button
// puts this string verbatim into ~/.claude/settings.json, which has a live Azure DevOps
// PAT on this machine and no tolerance for comment syntax.
test("hookFragment contains no comment lines", () => {
  // Check for a `//` comment TOKEN (line starting with it, once trimmed), not merely
  // the substring "//" — the URL itself legitimately contains "//" (http://...).
  const frag = hookFragment("http://127.0.0.1:45623/permission/abc123", 20);
  const commentLines = frag.split("\n").filter((l) => l.trim().startsWith("//"));
  assert.deepEqual(commentLines, []);
});

test("hookFragment merged into a hooks object round-trips through JSON.parse", () => {
  const url = "http://127.0.0.1:45623/permission/abc123";
  const frag = hookFragment(url, 20);
  const doc = `{"hooks": {${frag}}}`;
  const parsed = JSON.parse(doc);
  assert.equal(parsed.hooks.PermissionRequest[0].hooks[0].url, url);
  assert.equal(parsed.hooks.PermissionRequest[0].hooks[0].timeout, 20);
});

test("hookFragment escapes a URL that needs it and still round-trips", () => {
  // A secret containing a character JSON must escape (a literal quote), to prove the
  // builder truly relies on JSON.stringify rather than string interpolation.
  const url = 'http://127.0.0.1:45623/permission/ab"cd';
  const frag = hookFragment(url, 20);
  const parsed = JSON.parse(`{"hooks": {${frag}}}`);
  assert.equal(parsed.hooks.PermissionRequest[0].hooks[0].url, url);
});
