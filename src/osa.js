// Pure, side-effect-free helpers for the macOS platform adapter.
// No node:child_process, no I/O — everything here is unit-tested in test/osa.test.js.

// Escape a string for embedding inside an AppleScript double-quoted literal.
// Order matters: backslashes first, then quotes.
export function escapeAppleScript(s) {
  return String(s ?? "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
