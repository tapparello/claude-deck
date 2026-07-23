import { test } from "node:test";
import assert from "node:assert/strict";
import { escapeAppleScript, parseHotkey, hotkeyClause, classifyCustomCommand, parseKeychainToken } from "../src/osa.js";

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

test("parseHotkey: modifier + named key", () => {
  assert.deepEqual(parseHotkey("option+space"), {
    modifiers: ["option down"],
    key: { kind: "code", code: 49 },
  });
});

test("parseHotkey: multiple modifiers + letter", () => {
  assert.deepEqual(parseHotkey("cmd+shift+k"), {
    modifiers: ["command down", "shift down"],
    key: { kind: "char", char: "k" },
  });
});

test("parseHotkey: bare key, no modifiers", () => {
  assert.deepEqual(parseHotkey("space"), {
    modifiers: [],
    key: { kind: "code", code: 49 },
  });
});

test("parseHotkey: empty / null / unknown -> null", () => {
  assert.equal(parseHotkey(""), null);
  assert.equal(parseHotkey(null), null);
  assert.equal(parseHotkey("bogusmod+space"), null); // unknown modifier
  assert.equal(parseHotkey("cmd+"), null); // no key token
  assert.equal(parseHotkey("cmd+notakey"), null); // unknown multi-char key
});

test("hotkeyClause: key code with modifier", () => {
  assert.equal(hotkeyClause(parseHotkey("option+space")), "key code 49 using {option down}");
});

test("hotkeyClause: keystroke with modifiers", () => {
  assert.equal(
    hotkeyClause(parseHotkey("cmd+shift+k")),
    'keystroke "k" using {command down, shift down}',
  );
});

test("hotkeyClause: bare key, no using clause", () => {
  assert.equal(hotkeyClause(parseHotkey("return")), "key code 36");
});

test("hotkeyClause(null) is null", () => {
  assert.equal(hotkeyClause(null), null);
});

test("classifyCustomCommand: URL -> open as-is", () => {
  assert.deepEqual(classifyCustomCommand("https://claude.ai/new", {}), {
    mode: "open",
    arg: "https://claude.ai/new",
  });
});

test("classifyCustomCommand: existing path -> open", () => {
  const exists = (p) => p === "/Applications/Claude.app";
  assert.deepEqual(classifyCustomCommand("/Applications/Claude.app", { exists }), {
    mode: "open",
    arg: "/Applications/Claude.app",
  });
});

test("classifyCustomCommand: expands leading ~ before existence check", () => {
  const exists = (p) => p === "/Users/me/Notes";
  assert.deepEqual(classifyCustomCommand("~/Notes", { home: "/Users/me", exists }), {
    mode: "open",
    arg: "/Users/me/Notes",
  });
});

test("classifyCustomCommand: unknown -> treat as app name", () => {
  assert.deepEqual(classifyCustomCommand("Safari", { exists: () => false }), {
    mode: "app",
    arg: "Safari",
  });
});

test("classifyCustomCommand: empty/null -> null", () => {
  assert.equal(classifyCustomCommand("", {}), null);
  assert.equal(classifyCustomCommand(null, {}), null);
  assert.equal(classifyCustomCommand("   ", {}), null);
});

test("parseKeychainToken: extracts nested access token", () => {
  const raw = JSON.stringify({ claudeAiOauth: { accessToken: "sk-abc123" } });
  assert.equal(parseKeychainToken(raw), "sk-abc123");
});

test("parseKeychainToken: missing token -> null", () => {
  assert.equal(parseKeychainToken(JSON.stringify({ other: true })), null);
});

test("parseKeychainToken: invalid JSON -> null", () => {
  assert.equal(parseKeychainToken("not json at all"), null);
  assert.equal(parseKeychainToken(""), null);
});
