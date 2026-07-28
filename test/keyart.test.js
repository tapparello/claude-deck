import test from "node:test";
import assert from "node:assert/strict";
import { fit, fits, ruleLines, approveKey, usageMeterKey, statusKey, labelKey, actionKey, linesKey, burnKey, bigCountKey, gaugeKey } from "../src/keyart.js";

// Every key is 144 units wide. These tests exist because two strings shipped
// overflowing it silently: the ALWAYS key's rule line measured 199 units (clipped on
// both sides, so two different domains looked identical on the one key that writes a
// durable permission rule), and "$2399.28" measured 143 — edge to edge, no margin.
const BOX = 144;
const ADVANCE = 0.6; // same estimator keyart's fit() uses; validated against getBBox

// Pull every <text> back out of the data-URI SVG a renderer returns and work out how
// far it actually extends, honouring text-anchor.
function textExtents(dataUri) {
  const svg = decodeURIComponent(dataUri.replace(/^data:image\/svg\+xml,/, ""));
  const out = [];
  for (const m of svg.matchAll(/<text([^>]*)>([^<]*)<\/text>/g)) {
    const attrs = m[1], body = m[2];
    if (!body.trim()) continue;
    const num = (k) => Number((attrs.match(new RegExp(`${k}="([^"]+)"`)) ?? [])[1]);
    const anchor = (attrs.match(/text-anchor="([^"]+)"/) ?? [, "start"])[1];
    const w = body.length * ADVANCE * num("font-size");
    const x = num("x");
    const left = anchor === "middle" ? x - w / 2 : anchor === "end" ? x - w : x;
    out.push({ body, size: num("font-size"), left, right: left + w });
  }
  return out;
}
function assertInsideBox(dataUri, label) {
  for (const t of textExtents(dataUri)) {
    assert.ok(t.left >= -0.5, `${label}: "${t.body}" @${t.size} starts at ${t.left.toFixed(1)}, off the left edge`);
    assert.ok(t.right <= BOX + 0.5, `${label}: "${t.body}" @${t.size} ends at ${t.right.toFixed(1)}, past ${BOX}`);
  }
}

test("fit never returns a size that overflows the width it was given", () => {
  for (const n of [1, 4, 8, 11, 14, 20, 25, 36, 60]) {
    const s = "W".repeat(n);
    const size = fit(s, 120, 42);
    // The floor (min) is allowed to overflow — that is the caller's cue to split, and
    // ruleLines() is what does it. Above the floor, fit must actually fit.
    if (size > 11) assert.ok(fits(s, 120, size), `${n} chars @${size} does not fit 120`);
  }
});

test("fit honours the minimum floor rather than shrinking to nothing", () => {
  assert.equal(fit("W".repeat(200), 120, 42), 11);
  assert.equal(fit("W".repeat(200), 120, 42, 14), 14);
});

test("fit never exceeds the ideal size for short strings", () => {
  assert.equal(fit("7", 120, 42), 42);
  assert.equal(fit("", 120, 42), 42);
});

test("ruleLines keeps a short rule on one line", () => {
  assert.deepEqual(ruleLines("Bash(npm test)"), ["Bash(npm test)"]);
});

test("ruleLines splits the WebFetch rule that used to render 199 units wide", () => {
  const lines = ruleLines("WebFetch(domain:docs.amplify.aws)");
  assert.ok(lines.length >= 2, "should have split");
  assert.equal(lines.join("").includes("docs.amplify.aws"), true, "must not lose the domain");
  for (const l of lines) assert.ok(fits(l, 132, 13), `"${l}" is not legible even at 13px`);
});

test("ruleLines keeps every line legible at the RULE_FIT ceiling of 36 chars", () => {
  // alwaysRule() refuses past RULE_FIT (36), so these are the worst cases that can
  // reach a key. Includes one with no "(" at all, which has no structure to split on
  // and must fall through to the hard wrap.
  for (const rule of [
    "WebFetch(domain:sub.example-lon.com)",
    "Bash(some --very --long --command here)".slice(0, 36),
    "x".repeat(36),
  ]) {
    const lines = ruleLines(rule);
    for (const l of lines) assert.ok(fits(l, 132, 13), `"${l}" from "${rule}" is illegible`);
    assert.ok(lines.length <= 4, `"${rule}" split into ${lines.length} lines, more than fit`);
  }
});

test("no approve key overflows its box, in any state", () => {
  const w = (r) => [{ type: "addRules", behavior: "allow", rules: [{ toolName: r.split("(")[0], ruleContent: r.slice(r.indexOf("(") + 1, -1) }] }];
  const reqs = [
    { label: "bash", req: { cwd: "/a/claude-deck", toolName: "Bash", toolInput: { command: "npm test" }, suggestions: w("Bash(npm test)") } },
    { label: "webfetch", req: { cwd: "/a/claude-deck", toolName: "WebFetch", toolInput: { url: "https://docs.amplify.aws/x" }, suggestions: w("WebFetch(domain:docs.amplify.aws)") } },
    { label: "long-edit", req: { cwd: "/a/a-very-long-project-name", toolName: "Edit", toolInput: { file_path: "/a/b/an-extremely-long-filename.js" }, suggestions: w("Edit(/a/b/**)") } },
    { label: "no-rule", req: { cwd: "/a/claude-deck", toolName: "Bash", toolInput: { command: "rm -rf /" }, suggestions: [] } },
  ];
  for (const kind of ["approve-allow", "approve-always", "approve-deny"]) {
    assertInsideBox(approveKey(kind, null, {}), `${kind} idle`);
    assertInsideBox(approveKey(kind, null, { err: "port in use" }), `${kind} err`);
    for (const { label, req } of reqs) {
      for (const o of [{}, { depth: 8 }, { sessionOnly: true }, { denied: "just denied" }, { label: "verylonglabel" }]) {
        assertInsideBox(approveKey(kind, req, o), `${kind} ${label} ${JSON.stringify(o)}`);
      }
    }
  }
});

test("no report or action key overflows its box on adversarial input", () => {
  const LONG = "an-extremely-long-value-that-should-shrink";
  assertInsideBox(usageMeterKey("this month", "$2399.28", "cost", true), "usageMeter money");
  assertInsideBox(usageMeterKey("7-day", "$1234567.89", "cost", true), "usageMeter huge");
  assertInsideBox(usageMeterKey("today", "--", "no data", true), "usageMeter empty");
  assertInsideBox(gaugeKey("session 5h", 97, "1h 5m left", 1), "gauge");
  assertInsideBox(burnKey(40_600_000, "$39.25 last 5h"), "burn");
  assertInsideBox(bigCountKey("claude code", 7, "1 working", null, 2, null, false), "bigCount");
  assertInsideBox(linesKey("today", [{ text: "16 chats" }, { text: LONG }, { text: "58.6M tok" }]), "lines");
  assertInsideBox(statusKey("ctapparello", "needs-approval", 3, "WebFetch · 4s", "cli", 1), "status");
  assertInsideBox(statusKey(LONG, "working", 1, LONG, "code"), "status long");
  assertInsideBox(labelKey("FOCUS", LONG, LONG), "label long");
  assertInsideBox(labelKey("PROJECT", "claude-deck", "set folder in settings"), "label");
  assertInsideBox(actionKey("launch", "launch", "Desktop", "claude app"), "action");
  assertInsideBox(actionKey("web", "claude.ai", LONG, LONG), "action long");
});
