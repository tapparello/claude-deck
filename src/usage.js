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

function validNum(v) {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : undefined;
}

// [inR, outR] for a model id (family-prefix match), or null if unpriceable.
// `overrides` (per family {in,out}) win over defaults; mythos uses the fable key.
export function rateFor(model, overrides) {
  const m = String(model ?? "").toLowerCase();
  let fam = null;
  if (m.includes("opus")) fam = "opus";
  else if (m.includes("sonnet")) fam = "sonnet";
  else if (m.includes("haiku")) fam = "haiku";
  else if (m.includes("fable") || m.includes("mythos")) fam = "fable";
  if (!fam) return null;
  const [dIn, dOut] = RATES[fam];
  const o = overrides?.[fam];
  return [validNum(o?.in) ?? dIn, validNum(o?.out) ?? dOut];
}

// Estimated USD for one request's token usage. Unpriceable model -> 0.
// tok = {in, out, cacheRead, cacheCreate}. cache-read ≈0.1×input, create ≈1.25×input.
export function estimateCost(model, tok, overrides) {
  const r = rateFor(model, overrides);
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

function totalOf(tok) {
  return tok.in + tok.out + tok.cacheRead + tok.cacheCreate;
}

// Parse one transcript file's text into deduped requests (max total per id).
export function parseRequests(text) {
  const byId = new Map();
  const noId = [];
  for (const line of String(text ?? "").split("\n")) {
    if (!line) continue;
    let j;
    try { j = JSON.parse(line); } catch { continue; }
    if (j.type !== "assistant") continue;
    const u = j.message?.usage;
    if (!u || !j.timestamp) continue;
    const tok = {
      in: u.input_tokens || 0,
      out: u.output_tokens || 0,
      cacheRead: u.cache_read_input_tokens || 0,
      cacheCreate: u.cache_creation_input_tokens || 0,
    };
    const rec = { id: j.message?.id ?? j.requestId ?? null, t: new Date(j.timestamp).getTime(), model: j.message?.model ?? "", tok };
    if (rec.id == null) { noId.push(rec); continue; }
    const prev = byId.get(rec.id);
    if (!prev || totalOf(tok) > totalOf(prev.tok)) byId.set(rec.id, rec);
  }
  return [...byId.values(), ...noId];
}

// Merge per-file request lists into a global deduped list (max total per id).
export function mergeById(lists) {
  const byId = new Map();
  const noId = [];
  for (const list of lists) {
    for (const r of list) {
      if (r.id == null) { noId.push(r); continue; }
      const prev = byId.get(r.id);
      if (!prev || totalOf(r.tok) > totalOf(prev.tok)) byId.set(r.id, r);
    }
  }
  return [...byId.values(), ...noId];
}

// Aggregate tokens (all models) and estimated cost (priced models) over
// requests with t >= startMs.
export function aggregate(requests, startMs, overrides) {
  let tokens = 0, cost = 0;
  for (const r of requests) {
    if (r.t < startMs) continue;
    tokens += totalOf(r.tok);
    cost += estimateCost(r.model, r.tok, overrides);
  }
  return { tokens, cost };
}
