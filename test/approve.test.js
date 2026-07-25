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
