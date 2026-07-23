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
