import { test } from "node:test";
import assert from "node:assert/strict";
import { escapeAppleScript, parseHotkey, hotkeyClause, classifyCustomCommand, parseKeychainToken, outermostAppBundle, parsePsTree, hostAppForPid, focusStrategyForBundle, terminalFocusScript } from "../src/osa.js";

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

test("outermostAppBundle: outermost .app from a nested helper path", () => {
  assert.equal(
    outermostAppBundle("/Applications/Visual Studio Code.app/Contents/Frameworks/Code Helper (Plugin).app/Contents/MacOS/Code Helper (Plugin)"),
    "/Applications/Visual Studio Code.app",
  );
});
test("outermostAppBundle: main app binary path", () => {
  assert.equal(outermostAppBundle("/System/Applications/Utilities/Terminal.app/Contents/MacOS/Terminal"), "/System/Applications/Utilities/Terminal.app");
});
test("outermostAppBundle: non-app paths and junk -> null", () => {
  assert.equal(outermostAppBundle("/Users/me/.vscode/extensions/x/native-binary/claude"), null);
  assert.equal(outermostAppBundle("/bin/zsh"), null);
  assert.equal(outermostAppBundle("/Users/me/My.app.backup/foo"), null);
  assert.equal(outermostAppBundle(""), null);
  assert.equal(outermostAppBundle(null), null);
});
test("parsePsTree parses pid/ppid/comm (comm has spaces)", () => {
  const out = [
    "41178 36727 /Users/me/.vscode/extensions/x/native-binary/claude",
    "36727 35464 /Applications/Visual Studio Code.app/Contents/Frameworks/Code Helper (Plugin).app/Contents/MacOS/Code Helper (Plugin)",
    "35464     1 /Applications/Visual Studio Code.app/Contents/MacOS/Code",
    "",
  ].join("\n");
  const tree = parsePsTree(out);
  assert.equal(tree.get("41178").ppid, "36727");
  assert.equal(tree.get("35464").comm, "/Applications/Visual Studio Code.app/Contents/MacOS/Code");
  assert.equal(tree.size, 3);
});
test("hostAppForPid walks ancestry to the VS Code bundle", () => {
  const tree = parsePsTree([
    "41178 36727 /Users/me/.vscode/extensions/x/native-binary/claude",
    "36727 35464 /Applications/Visual Studio Code.app/Contents/Frameworks/Code Helper (Plugin).app/Contents/MacOS/Code Helper (Plugin)",
    "35464 1 /Applications/Visual Studio Code.app/Contents/MacOS/Code",
  ].join("\n"));
  assert.equal(hostAppForPid(tree, 41178), "/Applications/Visual Studio Code.app");
});
test("hostAppForPid returns null for a screen-detached session (no .app ancestor)", () => {
  const tree = parsePsTree([
    "68351 68000 /opt/homebrew/bin/screen",
    "68000 1 /sbin/launchd",
  ].join("\n"));
  assert.equal(hostAppForPid(tree, 68351), null);
});
test("hostAppForPid guards cycles and unknown pids", () => {
  const tree = parsePsTree("500 500 /bin/zsh");
  assert.equal(hostAppForPid(tree, 500), null);
  assert.equal(hostAppForPid(tree, 999), null);
});

test("focusStrategyForBundle maps known apps", () => {
  assert.equal(focusStrategyForBundle("/System/Applications/Utilities/Terminal.app"), "terminal");
  assert.equal(focusStrategyForBundle("/Applications/Visual Studio Code.app"), "vscode");
  assert.equal(focusStrategyForBundle("/Applications/iTerm.app"), "app");
  assert.equal(focusStrategyForBundle("/Applications/Terminal.app/"), "terminal"); // trailing slash tolerated
  assert.equal(focusStrategyForBundle(null), null);
});

// Regression guard for the "wrong terminal comes forward" bug (2026-07-25):
// `activate` must precede the window raise, and the raise must use
// `set frontmost of w to true` — NOT `set index of w to 1` followed by a
// trailing `activate`, which silently targets the last-used window whenever
// Terminal is in the background (i.e. every Stream Deck key press).
test("terminalFocusScript activates first and raises via frontmost", () => {
  const s = terminalFocusScript("ttys002");
  const joined = s.join("\n");
  const iActivate = s.findIndex((l) => l.trim() === "activate");
  const iRaise = s.findIndex((l) => l.includes("set frontmost of w to true"));
  assert.ok(iActivate >= 0, "must activate the app");
  assert.ok(iRaise >= 0, "must raise the matched window via frontmost");
  assert.ok(iActivate < iRaise, "activate must come BEFORE the window raise");
  assert.ok(!joined.includes("set index of w to 1"), "must not use the index+activate pattern");
  assert.match(joined, /ends with "ttys002"/);
  assert.equal(s.filter((l) => l.trim() === "activate").length, 1, "exactly one activate");
});

test("terminalFocusScript escapes the tty into the script", () => {
  assert.match(terminalFocusScript('x"y').join("\n"), /ends with "x\\"y"/);
});
