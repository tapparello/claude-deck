import { test } from "node:test";
import assert from "node:assert/strict";
import { escapeAppleScript } from "../src/osa.js";

test("escapeAppleScript leaves plain text alone", () => {
  assert.equal(escapeAppleScript("hello world"), "hello world");
});

test("escapeAppleScript escapes double quotes", () => {
  assert.equal(escapeAppleScript('say "hi"'), 'say \\"hi\\"');
});

test("escapeAppleScript escapes backslashes before quotes", () => {
  // input: a\b  ->  a\\b
  assert.equal(escapeAppleScript("a\\b"), "a\\\\b");
});

test("escapeAppleScript coerces null/undefined to empty string", () => {
  assert.equal(escapeAppleScript(null), "");
  assert.equal(escapeAppleScript(undefined), "");
});
