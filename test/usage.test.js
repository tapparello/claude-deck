import { test } from "node:test";
import assert from "node:assert/strict";
import { windowStartMs, rateFor, estimateCost, parseRequests, mergeById, aggregate } from "../src/usage.js";

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
