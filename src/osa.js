// Pure, side-effect-free helpers for the macOS platform adapter.
// No node:child_process, no I/O — everything here is unit-tested in test/osa.test.js.

// Escape a string for embedding inside an AppleScript double-quoted literal.
// Order matters: backslashes first, then quotes.
export function escapeAppleScript(s) {
  return String(s ?? "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

const HK_MODIFIERS = {
  cmd: "command down", command: "command down", "⌘": "command down",
  opt: "option down", option: "option down", alt: "option down", "⌥": "option down",
  ctrl: "control down", control: "control down", "⌃": "control down",
  shift: "shift down", "⇧": "shift down",
};

const HK_KEY_CODES = {
  space: 49, return: 36, enter: 36, tab: 48, escape: 53, esc: 53,
  up: 126, down: 125, left: 123, right: 124,
  f1: 122, f2: 120, f3: 99, f4: 118, f5: 96, f6: 97,
  f7: 98, f8: 100, f9: 101, f10: 109, f11: 103, f12: 111,
};

// Parse a "+"-separated hotkey string; last token is the key. Returns null on
// empty input, an unknown modifier, or an unknown multi-character key token.
export function parseHotkey(str) {
  if (str == null) return null;
  const tokens = String(str).split("+").map((t) => t.trim().toLowerCase()).filter(Boolean);
  if (!tokens.length) return null;
  const keyTok = tokens.pop();
  const modifiers = [];
  for (const t of tokens) {
    const m = HK_MODIFIERS[t];
    if (!m) return null;
    if (!modifiers.includes(m)) modifiers.push(m);
  }
  if (Object.prototype.hasOwnProperty.call(HK_KEY_CODES, keyTok)) {
    return { modifiers, key: { kind: "code", code: HK_KEY_CODES[keyTok] } };
  }
  if (keyTok.length === 1) return { modifiers, key: { kind: "char", char: keyTok } };
  return null;
}

// Render a parsed hotkey into an AppleScript System Events statement fragment.
export function hotkeyClause(parsed) {
  if (!parsed) return null;
  const using = parsed.modifiers.length ? ` using {${parsed.modifiers.join(", ")}}` : "";
  if (parsed.key.kind === "code") return `key code ${parsed.key.code}${using}`;
  return `keystroke "${escapeAppleScript(parsed.key.char)}"${using}`;
}

// Classify a "Claude Custom" target for macOS `open`.
// URL or existing filesystem path -> {mode:"open"}; otherwise -> {mode:"app"}
// (opened with `open -a`). A leading ~ is expanded before the existence check.
export function classifyCustomCommand(cmd, { home = "", exists = () => false } = {}) {
  const raw = String(cmd ?? "").trim();
  if (!raw) return null;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) return { mode: "open", arg: raw };
  let path = raw;
  if (raw === "~") path = home;
  else if (raw.startsWith("~/")) path = home + raw.slice(1);
  if (exists(path)) return { mode: "open", arg: path };
  return { mode: "app", arg: raw };
}

// Parse the JSON printed by `security find-generic-password ... -w`.
export function parseKeychainToken(raw) {
  try {
    const j = JSON.parse(raw);
    return j?.claudeAiOauth?.accessToken ?? null;
  } catch {
    return null;
  }
}

// --- Focus Session (macOS): resolve the GUI app hosting a session's PID ---

// The outermost .app bundle in an executable path, or null.
export function outermostAppBundle(execPath) {
  const m = /^(.*?\.app)\//.exec(String(execPath ?? ""));
  return m ? m[1] : null;
}

// Parse `ps -axo pid=,ppid=,comm=` output into Map(pid -> {ppid, comm}).
// comm is a full executable path that may contain spaces.
export function parsePsTree(out) {
  const tree = new Map();
  for (const line of String(out ?? "").split("\n")) {
    const m = /^\s*(\d+)\s+(\d+)\s+(.*\S)\s*$/.exec(line);
    if (m) tree.set(m[1], { ppid: m[2], comm: m[3] });
  }
  return tree;
}

// Walk from pid toward the root; return the first ancestor (including pid)
// whose executable lives inside a .app bundle, else null.
export function hostAppForPid(tree, pid, maxDepth = 16) {
  let cur = String(pid);
  const seen = new Set();
  for (let i = 0; i < maxDepth && cur && !seen.has(cur); i++) {
    seen.add(cur);
    const node = tree.get(cur);
    if (!node) break;
    const bundle = outermostAppBundle(node.comm);
    if (bundle) return bundle;
    cur = node.ppid;
  }
  return null;
}

// AppleScript that raises the Terminal window owning `tty`.
//
// Ordering is load-bearing, established empirically (2026-07-25): `activate`
// MUST come first, and the window is raised with `set frontmost of w to true`.
// The earlier version did `set index of w to 1` and then `activate` last, which
// works only while Terminal is already frontmost — the case that never happens
// when you press a Stream Deck key. Backgrounded, the trailing `activate`
// restored Terminal's own last-used window and discarded the index change, so
// pressing the key always surfaced the wrong terminal. Don't reorder these.
export function terminalFocusScript(tty) {
  const esc = escapeAppleScript(String(tty));
  return [
    "with timeout of 7 seconds",
    'tell application "Terminal"',
    "  activate",
    "  repeat with w in windows",
    "    repeat with t in tabs of w",
    `      if (tty of t) ends with "${esc}" then`,
    "        set selected of t to true",
    "        set frontmost of w to true",
    "        return",
    "      end if",
    "    end repeat",
    "  end repeat",
    "end tell",
    'error "not found"',
    "end timeout",
  ];
}

// Which focus strategy an app bundle gets: exact-window for Terminal (by tty)
// and VS Code (by window title), plain app-activation for anything else.
export function focusStrategyForBundle(bundle) {
  if (!bundle) return null;
  const base = String(bundle).replace(/\/+$/, "").split("/").pop();
  if (base === "Terminal.app") return "terminal";
  if (base === "Visual Studio Code.app") return "vscode";
  return "app";
}
