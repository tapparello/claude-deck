import { test } from "node:test";
import assert from "node:assert/strict";
import { windowStartMs, rateFor, estimateCost } from "../src/usage.js";

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
