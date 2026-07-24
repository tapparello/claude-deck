// Pure, I/O-free helpers for the "Usage" key. Unit-tested in test/usage.test.js.

// Start-of-window epoch ms for a window kind, relative to `now` (epoch ms),
// against local time. Unknown kind falls back to "today".
export function windowStartMs(kind, now) {
  if (kind === "7day") return now - 7 * 24 * 3600 * 1000;
  const d = new Date(now);
  if (kind === "month") d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
