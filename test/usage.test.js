import { test } from "node:test";
import assert from "node:assert/strict";
import { windowStartMs, rateFor, estimateCost, parseRequests, mergeById, aggregate, familyOf, aggregateByModel, budgetPct, gaugeSource, hasSubscriptionData, USAGE_FRESH_MS } from "../src/usage.js";

test("windowStartMs 7day is exactly now - 7 days", () => {
  const now = 1_800_000_000_000;
  assert.equal(windowStartMs("7day", now), now - 7 * 24 * 3600 * 1000);
});

test("windowStartMs today is local midnight, at or before now, within a day", () => {
  const now = Date.now();
  const s = windowStartMs("today", now);
  const d = new Date(s);
  assert.equal(d.getHours(), 0);
  assert.equal(d.getMinutes(), 0);
  assert.equal(d.getSeconds(), 0);
  assert.ok(s <= now);
  assert.ok(now - s <= 25 * 3600 * 1000); // ≤ a day (+DST slack)
});

test("windowStartMs month is the local 1st at 00:00, at or before now", () => {
  const now = Date.now();
  const s = windowStartMs("month", now);
  const d = new Date(s);
  assert.equal(d.getDate(), 1);
  assert.equal(d.getHours(), 0);
  assert.ok(s <= now);
});

test("windowStartMs unknown kind falls back to today", () => {
  const now = Date.now();
  assert.equal(windowStartMs("bogus", now), windowStartMs("today", now));
});

test("rateFor matches suffixed ids and bare aliases by family", () => {
  assert.deepEqual(rateFor("claude-opus-4-8"), [5, 25]);
  assert.deepEqual(rateFor("opus"), [5, 25]);
  assert.deepEqual(rateFor("claude-sonnet-5"), [3, 15]);
  assert.deepEqual(rateFor("sonnet"), [3, 15]);
  assert.deepEqual(rateFor("claude-haiku-4-5-20251001"), [1, 5]);
  assert.deepEqual(rateFor("claude-fable-5"), [10, 50]);
});

test("rateFor returns null for synthetic/unknown/empty", () => {
  assert.equal(rateFor("<synthetic>"), null);
  assert.equal(rateFor("gpt-4"), null);
  assert.equal(rateFor(""), null);
  assert.equal(rateFor(null), null);
});

test("estimateCost prices each token bucket at standard rates", () => {
  const M = 1_000_000;
  assert.equal(estimateCost("claude-opus-4-8", { in: M, out: 0, cacheRead: 0, cacheCreate: 0 }), 5);
  assert.equal(estimateCost("claude-opus-4-8", { in: 0, out: M, cacheRead: 0, cacheCreate: 0 }), 25);
  assert.equal(estimateCost("claude-opus-4-8", { in: 0, out: 0, cacheRead: M, cacheCreate: 0 }), 0.5); // 0.1×5
  assert.equal(estimateCost("claude-opus-4-8", { in: 0, out: 0, cacheRead: 0, cacheCreate: M }), 6.25); // 1.25×5
  assert.equal(estimateCost("claude-sonnet-5", { in: M, out: M, cacheRead: 0, cacheCreate: 0 }), 18); // 3+15
});

test("estimateCost is 0 for unpriceable models", () => {
  const M = 1_000_000;
  assert.equal(estimateCost("<synthetic>", { in: M, out: M, cacheRead: 0, cacheCreate: 0 }), 0);
  assert.equal(estimateCost("some-future-model", { in: M }), 0);
});

test("parseRequests dedupes by message.id taking the max snapshot", () => {
  const text = [
    '{"type":"user","timestamp":"2026-07-23T10:00:00Z"}',
    '{"type":"assistant","timestamp":"2026-07-23T10:00:01Z","message":{"id":"m1","model":"claude-opus-4-8","usage":{"input_tokens":100,"output_tokens":0}}}',
    '{"type":"assistant","timestamp":"2026-07-23T10:00:02Z","message":{"id":"m1","model":"claude-opus-4-8","usage":{"input_tokens":100,"output_tokens":50,"cache_read_input_tokens":10}}}',
    '{"type":"assistant","timestamp":"2026-07-23T10:00:03Z","message":{"id":"m2","model":"claude-sonnet-5","usage":{"input_tokens":200,"output_tokens":20}}}',
    '{"type":"assistant","timestamp":"2026-07-23T10:00:04Z","message":{"model":"claude-haiku-4-5","usage":{"output_tokens":5}}}',
    "",
  ].join("\n");
  const reqs = parseRequests(text);
  assert.equal(reqs.length, 3);
  const m1 = reqs.find((r) => r.id === "m1");
  assert.equal(m1.tok.out, 50);
  assert.equal(m1.tok.cacheRead, 10); // the fuller (max) snapshot won
  assert.equal(reqs.find((r) => r.id === "m2").tok.in, 200);
  assert.ok(reqs.some((r) => r.id == null && r.tok.out === 5)); // no-id line kept
});

test("mergeById keeps the global max per id and all no-id entries", () => {
  const a = [{ id: "a", t: 1, model: "x", tok: { in: 10, out: 0, cacheRead: 0, cacheCreate: 0 } }];
  const b = [{ id: "a", t: 2, model: "x", tok: { in: 30, out: 0, cacheRead: 0, cacheCreate: 0 } }];
  const merged = mergeById([a, b]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].tok.in, 30);

  const n1 = [{ id: null, t: 1, model: "x", tok: { in: 1, out: 0, cacheRead: 0, cacheCreate: 0 } }];
  const n2 = [{ id: null, t: 2, model: "x", tok: { in: 2, out: 0, cacheRead: 0, cacheCreate: 0 } }];
  assert.equal(mergeById([n1, n2]).length, 2);
});

test("aggregate filters by window and sums tokens (all) + cost (priced)", () => {
  const M = 1_000_000;
  const reqs = [
    { t: 200, model: "claude-opus-4-8", tok: { in: M, out: 0, cacheRead: 0, cacheCreate: 0 } },
    { t: 100, model: "claude-opus-4-8", tok: { in: M, out: 0, cacheRead: 0, cacheCreate: 0 } }, // before window
    { t: 300, model: "<synthetic>", tok: { in: 500_000, out: 0, cacheRead: 0, cacheCreate: 0 } },
  ];
  const { tokens, cost } = aggregate(reqs, 150);
  assert.equal(tokens, 1_500_000); // opus 1M + synthetic 0.5M in window; t=100 excluded
  assert.equal(cost, 5); // opus 1M input = $5; synthetic priced 0
});

test("parseRequests falls back to requestId when message.id is absent", () => {
  const text = [
    '{"type":"assistant","timestamp":"2026-07-23T10:00:00Z","requestId":"r9","message":{"model":"claude-opus-4-8","usage":{"input_tokens":300}}}',
    '{"type":"assistant","timestamp":"2026-07-23T10:00:01Z","requestId":"r9","message":{"model":"claude-opus-4-8","usage":{"input_tokens":300,"output_tokens":40}}}',
    "",
  ].join("\n");
  const reqs = parseRequests(text);
  assert.equal(reqs.length, 1); // deduped by requestId (message.id absent)
  assert.equal(reqs[0].id, "r9");
  assert.equal(reqs[0].tok.out, 40); // max snapshot won
});

test("rateFor applies input/output overrides per family (partial keeps default)", () => {
  const ov = { opus: { in: 4, out: 20 }, sonnet: { in: 2 } };
  assert.deepEqual(rateFor("claude-opus-4-8", ov), [4, 20]);
  assert.deepEqual(rateFor("claude-sonnet-5", ov), [2, 15]); // out defaults
  assert.deepEqual(rateFor("claude-haiku-4-5", ov), [1, 5]); // no override → default
});

test("rateFor override validNum: 0 accepted, junk/negative/string → default", () => {
  assert.deepEqual(rateFor("opus", { opus: { in: 0, out: 0 } }), [0, 0]);
  assert.deepEqual(rateFor("opus", { opus: { in: -1, out: NaN } }), [5, 25]);
  assert.deepEqual(rateFor("opus", { opus: { in: "3" } }), [5, 25]);
  assert.deepEqual(rateFor("opus", {}), [5, 25]);
});

test("rateFor: overrides never price an unpriceable model", () => {
  assert.equal(rateFor("<synthetic>", { opus: { in: 4 } }), null);
  assert.equal(rateFor("gpt-4", { opus: { in: 4 } }), null);
});

test("rateFor: mythos uses the fable override key", () => {
  assert.deepEqual(rateFor("claude-mythos-5", { fable: { in: 8, out: 40 } }), [8, 40]);
});

test("estimateCost applies overrides incl. cache multipliers on overridden input", () => {
  const M = 1_000_000;
  assert.equal(estimateCost("claude-opus-4-8", { in: M, out: 0, cacheRead: 0, cacheCreate: 0 }, { opus: { in: 4 } }), 4);
  assert.equal(estimateCost("claude-opus-4-8", { in: 0, out: 0, cacheRead: M, cacheCreate: 0 }, { opus: { in: 4 } }), 0.4); // 0.1×4
});

test("aggregate applies overrides to cost; tokens unchanged; default when omitted", () => {
  const M = 1_000_000;
  const reqs = [{ t: 200, model: "claude-opus-4-8", tok: { in: M, out: 0, cacheRead: 0, cacheCreate: 0 } }];
  assert.deepEqual(aggregate(reqs, 100, { opus: { in: 4 } }), { tokens: M, cost: 4 });
  assert.deepEqual(aggregate(reqs, 100), { tokens: M, cost: 5 });
});

// ---------- 5h rolling window ----------
test("windowStartMs 5h is exactly now-5h and ignores local midnight", () => {
  const now = new Date("2026-07-25T00:20:00Z").getTime(); // just after midnight UTC
  assert.equal(windowStartMs("5h", now), now - 5 * 3600 * 1000);
  // a rolling window must not be pinned to a day boundary like "today" is
  assert.notEqual(windowStartMs("5h", now), windowStartMs("today", now));
});

// ---------- familyOf ----------
test("familyOf shares one prefix chain with rateFor (incl. mythos->fable)", () => {
  assert.equal(familyOf("claude-opus-4-8"), "opus");
  assert.equal(familyOf("claude-sonnet-5"), "sonnet");
  assert.equal(familyOf("claude-haiku-4-5-20251001"), "haiku");
  assert.equal(familyOf("claude-mythos-1"), "fable");
  assert.equal(familyOf("<synthetic>"), null);
  assert.equal(familyOf(null), null);
  // rateFor must agree, or the two chains have drifted
  assert.ok(rateFor("claude-mythos-1"));
  assert.equal(rateFor("<synthetic>"), null);
});

// ---------- aggregateByModel ----------
const R = (model, t, inTok, outTok) => ({ model, t, tok: { in: inTok, out: outTok, cacheRead: 0, cacheCreate: 0 } });
test("aggregateByModel groups by family, sorts by cost, drops empty groups", () => {
  const now = 1_000_000_000;
  const reqs = [
    R("claude-sonnet-5", now, 1_000_000, 1_000_000),
    R("claude-opus-5", now, 1_000_000, 1_000_000),
    R("claude-opus-4-8", now, 1_000_000, 0),
    R("<synthetic>", now, 0, 0),              // zero usage, unpriceable -> dropped
    R("claude-haiku-4-5", now - 99_999, 5_000_000, 5_000_000), // before window
  ];
  const out = aggregateByModel(reqs, now - 1000);
  assert.deepEqual(out.map((e) => e.model), ["opus", "sonnet"]); // opus costs more
  assert.equal(out.find((e) => e.model === "opus").tokens, 3_000_000); // both opus reqs
  assert.ok(!out.some((e) => e.model === "haiku"), "pre-window request excluded");
  assert.ok(!out.some((e) => e.model === "other"), "zero-usage synthetic dropped");
  assert.deepEqual(aggregateByModel([], now), []);
});

// ---------- budgetPct ----------
test("budgetPct coerces strings and rejects unusable budgets", () => {
  assert.equal(budgetPct(2.5, 5), 50);
  assert.equal(budgetPct(2.5, "5"), 50);      // the PI stores strings
  assert.equal(budgetPct(10, 5), 200);        // over budget is reported truthfully
  assert.equal(budgetPct(1, 0), null);
  assert.equal(budgetPct(1, -5), null);
  assert.equal(budgetPct(1, ""), null);
  assert.equal(budgetPct(1, "abc"), null);
  assert.equal(budgetPct(1, undefined), null);
  assert.equal(budgetPct(undefined, 5), null);
});

// ---------- gaugeSource state machine ----------
test("gaugeSource: cold start is pending, never local", () => {
  // Both null for up to ~2min on a warm cache — must not flash local numbers
  // at a subscription user on every Stream Deck restart.
  assert.equal(gaugeSource({ usage: null, usageErr: null, usageAt: 0, now: 1000 }), "pending");
  assert.equal(gaugeSource({ usage: null, usageErr: null, usageAt: 0, now: 1000 }, true), "pending");
});

test("gaugeSource: fresh account-level data wins", () => {
  const now = 10_000_000;
  const fresh = { usage: { fiveHour: { pct: 42 } }, usageErr: null, usageAt: now - 1000, now };
  assert.equal(gaugeSource(fresh), "subscription");
  // scoped-only accounts have no `weekly` bucket but DO have a real limit
  assert.equal(gaugeSource({ ...fresh, usage: { scopedPct: 42, scopedName: "Opus" } }), "subscription");
  assert.equal(gaugeSource({ ...fresh, usage: { models: [{ name: "Opus", pct: 5 }] } }), "subscription");
});

test("gaugeSource: a frozen snapshot goes stale instead of reading as live", () => {
  const now = 10_000_000;
  // Token expired an hour ago: usageErr set, usage NOT cleared by pollUsage.
  const stale = { usage: { fiveHour: { pct: 62 } }, usageErr: "usage endpoint HTTP 401", usageAt: now - USAGE_FRESH_MS - 1, now };
  assert.equal(gaugeSource(stale, true), "error", "401 must prompt re-auth, not silently serve local");
  assert.equal(gaugeSource({ ...stale, usageErr: "no OAuth token in credentials file" }, true), "local");
  assert.equal(gaugeSource({ ...stale, usageErr: null }, true), "local", "stale + local data available");
  assert.equal(gaugeSource({ ...stale, usageErr: null }, false), "pending", "stale + nothing local yet");
});

test("gaugeSource: 429 keeps the throttled message", () => {
  const now = 10_000_000;
  assert.equal(gaugeSource({ usage: null, usageErr: "usage endpoint HTTP 429 (backing off to 60s)", usageAt: 0, now }, true), "throttled");
});

test("hasSubscriptionData is account-level, not per-bucket", () => {
  assert.equal(hasSubscriptionData(null), false);
  assert.equal(hasSubscriptionData({}), false);
  assert.equal(hasSubscriptionData({ models: [] }), false);
  assert.equal(hasSubscriptionData({ weeklyOpus: { pct: 1 } }), true);
  assert.equal(hasSubscriptionData({ scopedPct: 0 }), true); // 0 is real data
});
