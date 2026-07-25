import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeSuggestions, decisionBody, DENY_MESSAGE } from "../src/approve.js";

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

import { describeRequest, alwaysRule, TARGET_MAX, RULE_MAX } from "../src/approve.js";

const req = (over = {}) => ({ cwd: "/Users/x/dev/claude-deck", toolName: "Bash", toolInput: { command: "npm test" }, suggestions: [], ...over });

test("describeRequest names the project from cwd", () => {
  assert.equal(describeRequest(req()).name, "claude-deck");
  // 11-char cap: basename is truncated, not ellipsised away
  assert.equal(describeRequest(req({ cwd: "/a/fmf_connect_flutter" })).name.length, 11);
  assert.equal(describeRequest(req({ cwd: undefined })).name, "");
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

test("alwaysRule truncates long rule text rather than disabling the key", () => {
  const r = req({ suggestions: [sugg("some/very/long/path/prefix *")] });
  const out = alwaysRule(r);
  assert.equal(out.length, RULE_MAX);
  assert.ok(out.endsWith("…"), out);
});
