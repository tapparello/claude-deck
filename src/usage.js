// Pure, I/O-free helpers for the "Usage" key. Unit-tested in test/usage.test.js.

// Start-of-window epoch ms for a window kind, relative to `now` (epoch ms),
// against local time. Unknown kind falls back to "today".
export function windowStartMs(kind, now) {
  // Rolling windows return early — no Date/local-midnight involvement, so they
  // are DST-immune and re-evaluate correctly against a fresh `now` each poll.
  if (kind === "5h") return now - 5 * 3600 * 1000;
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

// Pricing family for a model id, or null when unpriceable (e.g. "<synthetic>").
// Exported so per-model grouping and rateFor share ONE prefix chain — this rule
// drifts otherwise (mythos → fable is exactly the kind of thing that gets lost).
export function familyOf(model) {
  const m = String(model ?? "").toLowerCase();
  if (m.includes("opus")) return "opus";
  if (m.includes("sonnet")) return "sonnet";
  if (m.includes("haiku")) return "haiku";
  if (m.includes("fable") || m.includes("mythos")) return "fable";
  return null;
}

// [inR, outR] for a model id (family-prefix match), or null if unpriceable.
// `overrides` (per family {in,out}) win over defaults; mythos uses the fable key.
export function rateFor(model, overrides) {
  const fam = familyOf(model);
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
// `tokens` is the grand total (incl. cache); `in`/`out` are the plain input and
// output counts, which the keys show when toggled out of cost view. Cache reads
// and writes are deliberately not folded into `in` — they are billed at
// different multipliers and lumping them would misreport the input figure.
export function aggregate(requests, startMs, overrides) {
  let tokens = 0, cost = 0, inTok = 0, outTok = 0;
  for (const r of requests) {
    if (r.t < startMs) continue;
    tokens += totalOf(r.tok);
    inTok += r.tok?.in ?? 0;
    outTok += r.tok?.out ?? 0;
    cost += estimateCost(r.model, r.tok, overrides);
  }
  return { tokens, cost, in: inTok, out: outTok };
}

// Per-family totals within a window, most expensive first. Requests whose model
// has no pricing family (the real "<synthetic>" transcript entries, which carry
// all-zero usage) group under "other" and are dropped when they contribute no
// tokens, so the list never shows a phantom $0 row.
export function aggregateByModel(requests, startMs, overrides) {
  const by = new Map();
  for (const r of requests ?? []) {
    if (r.t < startMs) continue;
    const fam = familyOf(r.model) ?? "other";
    const cur = by.get(fam) ?? { model: fam, tokens: 0, cost: 0 };
    cur.tokens += (r.tok?.in ?? 0) + (r.tok?.out ?? 0) + (r.tok?.cacheRead ?? 0) + (r.tok?.cacheCreate ?? 0);
    cur.cost += estimateCost(r.model, r.tok, overrides);
    by.set(fam, cur);
  }
  return [...by.values()]
    .filter((e) => e.tokens > 0 || e.cost > 0)
    .sort((a, b) => b.cost - a.cost || b.tokens - a.tokens);
}

// Percent of a self-set budget, or null when there is no usable budget. The PI
// stores raw strings, so coerce rather than trusting the type.
export function budgetPct(spend, budget) {
  const b = Number(budget);
  if (!Number.isFinite(b) || b <= 0) return null;
  const s = Number(spend);
  if (!Number.isFinite(s) || s < 0) return null;
  return (s / b) * 100;
}

// How a gauge key should source its numbers. Pure so the whole table is tested.
//
// Presence alone is NOT enough: pollUsage sets usageErr on failure but never
// clears state.usage, and usageAt only advances on success — so an expired token
// leaves a frozen snapshot that would otherwise read as live data.
//   "pending"      nothing known yet (cold start) -> keep today's "--"
//   "subscription" fresh account-level limit data
//   "throttled"    429 -> today's message; the API does apply, just rate-limited
//   "local"        no consumer token, or stale data and local numbers exist
//   "error"        any other failure -> today's "sign in?", never silently local
export const USAGE_FRESH_MS = 30 * 60_000;
export function hasSubscriptionData(usage) {
  if (!usage) return false;
  return !!(usage.fiveHour || usage.weekly || usage.weeklyOpus ||
    usage.scopedPct != null || (usage.models ?? []).length);
}
export function gaugeSource({ usage, usageErr, usageAt, now }, hasLocal = false) {
  if (usage == null && !usageErr) return "pending";
  const fresh = hasSubscriptionData(usage) && now - (usageAt ?? 0) < USAGE_FRESH_MS;
  if (fresh) return "subscription";
  if (usageErr && String(usageErr).includes("429")) return "throttled";
  if (usageErr && String(usageErr).includes("no OAuth token")) return "local";
  if (usageErr) return "error";
  return hasLocal ? "local" : "pending";
}
