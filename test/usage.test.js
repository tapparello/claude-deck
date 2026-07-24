import { test } from "node:test";
import assert from "node:assert/strict";
import { windowStartMs } from "../src/usage.js";

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
