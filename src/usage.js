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

// Per-MTok rates (USD): [inputRate, outputRate], keyed by model family.
const RATES = { opus: [5, 25], sonnet: [3, 15], haiku: [1, 5], fable: [10, 50] };

// [inR, outR] for a model id (family-prefix match), or null if unpriceable.
export function rateFor(model) {
  const m = String(model ?? "").toLowerCase();
  if (m.includes("opus")) return RATES.opus;
  if (m.includes("sonnet")) return RATES.sonnet;
  if (m.includes("haiku")) return RATES.haiku;
  if (m.includes("fable") || m.includes("mythos")) return RATES.fable;
  return null;
}

// Estimated USD for one request's token usage. Unpriceable model -> 0.
// tok = {in, out, cacheRead, cacheCreate}. cache-read ≈0.1×input, create ≈1.25×input.
export function estimateCost(model, tok) {
  const r = rateFor(model);
  if (!r) return 0;
  const [inR, outR] = r;
  const t = tok || {};
  return (
    (t.in || 0) * inR +
    (t.out || 0) * outR +
    (t.cacheRead || 0) * 0.1 * inR +
    (t.cacheCreate || 0) * 1.25 * inR
  ) / 1e6;
}
