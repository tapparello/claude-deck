// Claude Deck — Stream Deck plugin
// Shows live Claude subscription usage (same numbers as Claude Desktop / /usage),
// running Claude Code sessions, and quick-launch keys.
import { WebSocket } from "ws";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn, execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { escapeAppleScript, parseHotkey, hotkeyClause, classifyCustomCommand, parseKeychainToken, parsePsTree, hostAppForPid, focusStrategyForBundle, terminalFocusScript } from "./osa.js";
import { windowStartMs, parseRequests, mergeById, aggregate, aggregateByModel, budgetPct, gaugeSource, familyOf } from "./usage.js";
import { resolveStatusKey, statusEntry, autoSlot, sessionWhere, fmtShort, shortWait, sessionState, blockedSessions, sessionSig, transcriptPathFor } from "./status.js";
import { randomBytes } from "node:crypto";
import {
  decisionBody, describeRequest, alwaysRule, pressDecision,
  enqueue, head, resolve, expiredIds, staleIds, seedBaselines, hookFragment,
  rememberDeny, denyBlock, pruneDenies,
  PORT_DEFAULT, HOLD_S_DEFAULT, QUEUE_MAX, RULE_MAX,
} from "./approve.js";
import { startHookServer, BADPATH_WINDOW_MS, BADPATH_MIN_HITS } from "./hookserver.js";

const IS_MAC = process.platform === "darwin";

const PLUGIN_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const CLAUDE_DIR = path.join(os.homedir(), ".claude");
const CREDS_FILE = path.join(CLAUDE_DIR, ".credentials.json");
const SESSIONS_DIR = path.join(CLAUDE_DIR, "sessions");
const PROJECTS_DIR = path.join(CLAUDE_DIR, "projects");
const STATS_CACHE = path.join(CLAUDE_DIR, "stats-cache.json");
const USAGE_URL = "https://api.anthropic.com/api/oauth/usage";
const githubDir = path.join(os.homedir(), "Documents", "GitHub");
const DEFAULT_CODE_DIR = fs.existsSync(githubDir) ? githubDir : os.homedir();

// Claude Desktop (Microsoft Store) — resolved from the Start menu at startup so any install works
let desktopAppId = "shell:AppsFolder\\Claude_pzs8sxrjxfjjc!Claude";
if (!IS_MAC) {
  execFile("powershell.exe", ["-NoProfile", "-Command",
    "Get-StartApps | Where-Object {$_.Name -eq 'Claude'} | Select-Object -First 1 -ExpandProperty AppID"],
    (err, out) => { const id = out?.trim(); if (!err && id) desktopAppId = "shell:AppsFolder\\" + id; });
}

// ---------- logging ----------
const LOG_FILE = path.join(process.cwd(), "claude-deck.log");
function log(...args) {
  const line = `${new Date().toISOString()} ${args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ")}`;
  console.log(line);
  try { fs.appendFileSync(LOG_FILE, line + "\n"); } catch {}
}

// ---------- theme ----------
const C = {
  bg: "#16151c",
  panel: "#211f2b",
  text: "#f5f1ea",
  dim: "#9b96a8",
  accent: "#d97757", // Claude orange
  ok: "#4ade80",
  warn: "#fbbf24",
  bad: "#f87171",
  track: "#3a3745",
  info: "#60a5fa", // status: working (blue)
  ask: "#a855f7", // status: input needed (purple)
};
const pctColor = (p) => (p == null ? C.dim : p >= 85 ? C.bad : p >= 60 ? C.warn : C.ok);
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");


// ---------- svg key renderers (144x144) ----------

// Translucent wash of a state colour plus concentric strokes that read as a
// glow — the look from the reference mockup. Concentric strokes rather than an
// SVG blur filter: the Stream Deck renderer can't be relied on to support
// feGaussianBlur. `strong` is for the two "blocked on you" states.
function tintFrame(col, strong = false, phase = null) {
  if (!col) return "";
  // phase != null → breathe: the wash and the outer halo rings vary across the
  // ticker's 3 frames while the main border holds, so it pulses without flicker.
  const p = phase == null ? 1 : [0.3, 0.65, 1][phase % 3];
  const washOp = (strong ? 0.22 : 0.1) * (phase == null ? 1 : 0.6 + 0.4 * p);
  // The 5px stroke is the element the eye actually tracks, so IT has to swing —
  // gaugeKey's pulse moves its 6px stroke 0.2→0.95 for the same reason. Holding
  // it constant (as the first cut did) made the breath imperceptible at arm's
  // length while still paying the full frame cost.
  const mainOp = phase == null ? (strong ? 1 : 0.8) : 0.25 + 0.75 * p;
  return `<rect width="144" height="144" rx="18" fill="${col}" opacity="${washOp.toFixed(3)}"/>
    <rect x="2" y="2" width="140" height="140" rx="17" fill="none" stroke="${col}" stroke-width="2" opacity="${((strong ? 0.45 : 0.22) * p).toFixed(3)}"/>
    <rect x="5" y="5" width="134" height="134" rx="15" fill="none" stroke="${col}" stroke-width="${strong ? 5 : 3}" opacity="${mainOp.toFixed(3)}"/>
    <rect x="9.5" y="9.5" width="125" height="125" rx="12" fill="none" stroke="${col}" stroke-width="1" opacity="${(0.18 * p).toFixed(3)}"/>`;
}

function svgWrap(inner) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="144" height="144" viewBox="0 0 144 144"><rect width="144" height="144" rx="18" fill="${C.bg}"/>${inner}</svg>`;
  return "data:image/svg+xml," + encodeURIComponent(svg);
}

function gaugeKey(label, pct, sub, pulsePhase = null) {
  const has = typeof pct === "number" && isFinite(pct);
  const p = has ? Math.max(0, Math.min(100, pct)) : 0;
  const col = has ? pctColor(p) : C.dim;
  const pulse = pulsePhase == null ? "" :
    `<rect x="4" y="4" width="136" height="136" rx="16" fill="none" stroke="${C.bad}" stroke-width="6" opacity="${[0.2, 0.55, 0.95][pulsePhase % 3]}"/>`;
  return svgWrap(`
    ${pulse}
    <text x="14" y="27" font-family="-apple-system, Segoe UI, system-ui, sans-serif" font-size="17" font-weight="600" letter-spacing="0.5" fill="${C.dim}">${esc(label)}</text>
    <text x="72" y="78" text-anchor="middle" font-family="-apple-system, Segoe UI, system-ui, sans-serif" font-size="${has ? 46 : 34}" font-weight="700" fill="${has ? col : C.dim}">${has ? Math.round(p) + "%" : "--"}</text>
    <rect x="14" y="90" width="116" height="12" rx="6" fill="${C.track}"/>
    ${has ? `<rect x="14" y="90" width="${Math.max(8, (116 * p) / 100)}" height="12" rx="6" fill="${col}"/>` : ""}
    <text x="72" y="128" text-anchor="middle" font-family="-apple-system, Segoe UI, system-ui, sans-serif" font-size="16" fill="${C.dim}">${esc(sub ?? "")}</text>`);
}

function linesKey(title, rows, accent = C.accent) {
  const rowSvg = rows
    .map((r, i) => {
      const y = 62 + i * 31;
      return `<text x="14" y="${y}" font-family="-apple-system, Segoe UI, system-ui, sans-serif" font-size="${r.big ? 28 : 20}" font-weight="${r.big ? 700 : 600}" fill="${r.color ?? C.text}">${esc(r.text)}</text>`;
    })
    .join("");
  return svgWrap(`
    <rect x="0" y="0" width="144" height="34" rx="18" fill="${C.panel}"/>
    <rect x="0" y="17" width="144" height="17" fill="${C.panel}"/>
    <text x="14" y="24" font-family="-apple-system, Segoe UI, system-ui, sans-serif" font-size="17" font-weight="600" letter-spacing="0.5" fill="${accent}">${esc(title)}</text>
    ${rowSvg}`);
}

function bigCountKey(title, count, sub, subColor, animPhase = null, tint = null, strong = false) {
  // animPhase non-null → cycling activity dots beside the count (frame-pushed animation)
  const dots = animPhase == null ? "" : [0, 1, 2]
    .map((i) => `<circle cx="122" cy="${56 + i * 16}" r="${i === animPhase ? 4.5 : 3}" fill="${i === animPhase ? (tint ?? C.info) : C.track}"/>`)
    .join("");
  return svgWrap(`
    ${tintFrame(tint, strong)}
    <text x="14" y="27" font-family="-apple-system, Segoe UI, system-ui, sans-serif" font-size="17" font-weight="600" letter-spacing="0.5" fill="${C.dim}">${esc(title)}</text>
    ${dots}
    <text x="72" y="96" text-anchor="middle" font-family="-apple-system, Segoe UI, system-ui, sans-serif" font-size="64" font-weight="700" fill="${count > 0 ? C.text : C.dim}">${count}</text>
    <text x="72" y="128" text-anchor="middle" font-family="-apple-system, Segoe UI, system-ui, sans-serif" font-size="17" fill="${subColor ?? C.dim}">${esc(sub ?? "")}</text>`);
}

function burnKey(tokensHour, sub) {
  const has = tokensHour != null;
  return svgWrap(`
    <text x="14" y="27" font-family="-apple-system, Segoe UI, system-ui, sans-serif" font-size="17" font-weight="600" letter-spacing="0.5" fill="${C.dim}">BURN RATE</text>
    <text x="72" y="82" text-anchor="middle" font-family="-apple-system, Segoe UI, system-ui, sans-serif" font-size="40" font-weight="700" fill="${has ? C.accent : C.dim}">${has ? fmtNum(tokensHour) : "--"}</text>
    <text x="72" y="104" text-anchor="middle" font-family="-apple-system, Segoe UI, system-ui, sans-serif" font-size="16" fill="${C.dim}">tok/hr</text>
    <text x="72" y="128" text-anchor="middle" font-family="-apple-system, Segoe UI, system-ui, sans-serif" font-size="15" fill="${C.dim}">${esc(sub ?? "")}</text>`);
}

function usageMeterKey(header, big, sub, isCost) {
  const dim = String(big) === "--";
  return svgWrap(`
    <text x="14" y="27" font-family="-apple-system, Segoe UI, system-ui, sans-serif" font-size="17" font-weight="600" letter-spacing="0.5" fill="${C.dim}">${esc(header)}</text>
    <text x="72" y="84" text-anchor="middle" font-family="-apple-system, Segoe UI, system-ui, sans-serif" font-size="${String(big).length > 6 ? 30 : 40}" font-weight="700" fill="${dim ? C.dim : C.accent}">${esc(big)}</text>
    ${isCost && !dim ? `<text x="130" y="58" text-anchor="end" font-family="-apple-system, Segoe UI, system-ui, sans-serif" font-size="13" fill="${C.dim}">est</text>` : ""}
    <text x="72" y="128" text-anchor="middle" font-family="-apple-system, Segoe UI, system-ui, sans-serif" font-size="15" fill="${C.dim}">${esc(sub)}</text>`);
}

// A gauge key rendered from local transcript data. With a budget it becomes the
// familiar ring (gaugeKey clamps the drawn bar at 100%, so an overage is carried
// in the sub-line instead); without one it shows the absolute spend. A missing
// aggregate renders "--" — never "$0.00", which would claim zero spend on a
// machine that has spent hundreds today.
function localGauge(header, agg, budget, view = "cost") {
  if (!agg) return usageMeterKey(header, "--", "no data yet", true);
  // Token view: the grand total big, with the plain input/output split beneath,
  // since that is what you compare against a provider's per-token billing.
  if (view === "tokens") {
    return usageMeterKey(header, fmtNum(agg.tokens), `${fmtNum(agg.in)} in · ${fmtNum(agg.out)} out`, false);
  }
  const pct = budgetPct(agg.cost, budget);
  if (pct == null) return usageMeterKey(header, "$" + agg.cost.toFixed(2), "est", true);
  const over = pct > 100 ? " · " + Math.round(pct) + "%" : "";
  return gaugeKey(header, pct, `$${Math.round(agg.cost)} / $${Math.round(Number(budget))}${over}`, pct >= 90 ? animPhase : null);
}

// Generic key for configurable actions: header + big wrapped label + footer
function labelKey(title, label, sub, accent = C.accent, tint = null, strong = false) {
  const text = String(label ?? "").trim() || "—";
  const words = text.split(/\s+/);
  const lines = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length <= 11) cur = (cur + " " + w).trim();
    else { lines.push(cur); cur = w; if (lines.length === 2) break; }
  }
  if (cur && lines.length < 2) lines.push(cur);
  const lineSvg = lines.slice(0, 2)
    .map((l, i) => `<text x="72" y="${lines.length > 1 ? 68 + i * 27 : 82}" text-anchor="middle" font-family="-apple-system, Segoe UI, system-ui, sans-serif" font-size="22" font-weight="700" fill="${C.text}">${esc(l.slice(0, 12))}</text>`)
    .join("");
  return svgWrap(`
    ${tintFrame(tint, strong)}
    <text x="14" y="27" font-family="-apple-system, Segoe UI, system-ui, sans-serif" font-size="17" font-weight="600" letter-spacing="0.5" fill="${accent}">${esc(title)}</text>
    ${lineSvg}
    <text x="72" y="128" text-anchor="middle" font-family="-apple-system, Segoe UI, system-ui, sans-serif" font-size="15" fill="${C.dim}">${esc(sub ?? "")}</text>`);
}

// Per-session status key: project name + state word, tinted by state.
// st ∈ "working" | "idle" | "none". count>1 shows a collision badge;
// detail (optional) is a small third line used while cycling collisions.
// st ∈ needs-approval | input-needed | working | finished | idle | none.
// The two "blocked on you" states get a filled band behind the label, not just a
// hairline border: a thin colored outline is unreliable at arm's length on a
// physical key and yellow-vs-green outlines are a red/green-blind trap.
const STATUS_LOOK = {
  "needs-approval": { label: "Needs approval", col: C.warn, strong: true },
  "input-needed": { label: "Input needed", col: C.ask, strong: true },
  working: { label: "Working", col: C.info },
  finished: { label: "Finished", col: C.ok },
  idle: { label: "Idle", col: C.dim },
  none: { label: "no session", col: C.dim },
  quiet: { label: "all clear", col: C.dim }, // Waiting key, nothing pending
  // A session that reports no status (VS Code extension) and whose transcript
  // we couldn't stat. Saying "no status" beats inventing "Idle".
  unknown: { label: "no status", col: C.dim },
};
function statusKey(name, st, count, detail = "", tag = "", phase = null) {
  const look = STATUS_LOOK[st] ?? STATUS_LOOK.none;
  const { label, col } = look;
  const strong = !!look.strong;
  const shown = name || "CLAUDE";
  // Count badge wins the corner; otherwise the "cli"/"code" tag, which is the
  // only way to tell two sessions in the same project apart.
  const corner = count > 1
    ? `<circle cx="120" cy="26" r="13" fill="${C.panel}" stroke="${col}" stroke-width="1.5"/><text x="120" y="31" text-anchor="middle" font-family="-apple-system, Segoe UI, system-ui, sans-serif" font-size="15" font-weight="700" fill="${C.text}">${count}</text>`
    : tag
    ? `<text x="132" y="30" text-anchor="end" font-family="-apple-system, Segoe UI, system-ui, sans-serif" font-size="13" font-weight="600" fill="${C.dim}">${esc(tag)}</text>`
    : "";
  return svgWrap(`
    ${tintFrame(col, strong, phase)}
    ${corner}
    <text x="72" y="72" text-anchor="middle" font-family="-apple-system, Segoe UI, system-ui, sans-serif" font-size="${String(shown).length > 9 ? 22 : 26}" font-weight="700" fill="${st === "none" ? C.dim : C.text}">${esc(String(shown).slice(0, 11))}</text>
    <text x="72" y="100" text-anchor="middle" font-family="-apple-system, Segoe UI, system-ui, sans-serif" font-size="${label.length > 11 ? 15 : 18}" font-weight="700" fill="${col}">${esc(label)}</text>
    ${detail ? `<text x="72" y="124" text-anchor="middle" font-family="-apple-system, Segoe UI, system-ui, sans-serif" font-size="13" fill="${C.dim}">${esc(detail)}</text>` : ""}`);
}

const APPROVE_LOOK = {
  "approve-allow": { word: "ALLOW", col: C.ok },
  "approve-always": { word: "ALWAYS", col: C.info },
  "approve-deny": { word: "DENY", col: C.bad },
};
// Nothing pending -> the same calm dim look the Waiting key uses. A pending request
// tints the frame and (while fresh) breathes. ALLOW/DENY show the command; ALWAYS
// shows the RULE it would persist, because Claude Code's suggestions are wildcards.
function approveKey(kind, req, o = {}) {
  const look = APPROVE_LOOK[kind];
  const t = (y, size, weight, fill, s) =>
    `<text x="72" y="${y}" text-anchor="middle" font-family="-apple-system, Segoe UI, system-ui, sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}">${esc(s)}</text>`;

  if (o.err) {
    return svgWrap(`${tintFrame(C.bad, true)}${t(66, 20, 700, C.text, look.word)}${t(96, 15, 600, C.bad, o.err)}`);
  }
  if (!req) {
    return svgWrap(`${tintFrame(C.track, false)}${t(66, 20, 700, C.dim, look.word)}${t(96, 14, 600, C.dim, "all clear")}`);
  }

  const { name, target } = describeRequest(req);
  const rule = kind === "approve-always" ? alwaysRule(req, !!o.sessionOnly) : null;
  // o.denied is set when this target's rule was DENIED in the last DENY_WINDOW_MS. The
  // rule still renders above the word, greyed: the user needs to see WHAT is blocked,
  // and hiding it would make this look like the unrelated "n/a" case.
  const denied = kind === "approve-always" && rule !== null && !!o.denied;
  const disabled = kind === "approve-always" && (rule === null || denied);
  const col = disabled ? C.dim : look.col;
  const word = kind === "approve-always"
    ? (denied ? String(o.denied) : rule === null ? "ALWAYS n/a" : `ALWAYS ·${o.sessionOnly ? "session" : "project"}`)
    : look.word;
  // Depth badge wins the corner, else an optional user label. The project name keeps
  // line 1 unconditionally: it is a wrong-request mitigation, so a cosmetic label must
  // not be able to hide it.
  const corner = o.depth > 1
    ? `<circle cx="120" cy="26" r="13" fill="${C.panel}" stroke="${col}" stroke-width="1.5"/>` +
      `<text x="120" y="31" text-anchor="middle" font-family="-apple-system, Segoe UI, system-ui, sans-serif" font-size="15" font-weight="700" fill="${C.text}">${o.depth}</text>`
    : o.label
    ? `<text x="132" y="30" text-anchor="end" font-family="-apple-system, Segoe UI, system-ui, sans-serif" font-size="13" font-weight="600" fill="${C.dim}">${esc(String(o.label).slice(0, 8))}</text>`
    : "";

  // ALWAYS shows the RULE it would persist, in full (alwaysRule() no longer truncates -
  // see src/approve.js). A rule over RULE_MAX (18) chars - e.g. any WebFetch domain
  // grant, since "WebFetch(domain:" alone is 16 - is split at "(" across two lines
  // (tool name, then the (ruleContent) that actually matters) rather than shrunk into a
  // shared, illegible prefix. A rule too long even for two lines makes alwaysRule()
  // return null, which is the existing disabled "ALWAYS n/a" path below: a rule that
  // cannot be shown honestly must not be pressable. ALLOW/DENY keep the original
  // single-line target rendering untouched.
  const splitRule = kind === "approve-always" && rule != null && rule.length > RULE_MAX;
  let body;
  if (splitRule) {
    const splitAt = rule.indexOf("(");
    const line1 = splitAt >= 0 ? rule.slice(0, splitAt) : rule;
    const line2 = splitAt >= 0 ? rule.slice(splitAt) : "";
    body = `${t(42, 12, 600, C.dim, name)}${t(66, 15, 700, C.text, line1)}${t(88, 15, 700, C.text, line2)}`;
  } else {
    const shown = kind === "approve-always" ? (rule ?? target) : target;
    const size = kind === "approve-always" && rule != null ? 18 : (shown.length > 11 ? 18 : 22);
    body = `${t(52, 13, 600, C.dim, name)}${t(84, size, 700, C.text, shown)}`;
  }

  return svgWrap(`
    ${tintFrame(col, !disabled, disabled ? null : o.phase)}
    ${corner}
    ${body}
    ${t(112, word.length > 11 ? 14 : 18, 700, col, word)}`);
}

// ---------- formatting ----------
function fmtReset(iso) {
  if (!iso) return "";
  const ms = new Date(iso).getTime() - Date.now();
  if (!isFinite(ms) || ms <= 0) return "resetting…";
  const h = Math.floor(ms / 3.6e6), m = Math.round((ms % 3.6e6) / 6e4);
  if (h >= 48) return `${Math.round(h / 24)}d left`;
  return h > 0 ? `${h}h ${m}m left` : `${m}m left`;
}
function fmtNum(n) {
  if (n == null) return "--";
  if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "k";
  return String(n);
}
function fmtAgo(ts) {
  const ms = Date.now() - ts;
  const h = Math.floor(ms / 3.6e6), m = Math.floor((ms % 3.6e6) / 6e4);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ---------- data: usage (OAuth endpoint — same source as /usage & Claude Desktop) ----------
const state = {
  activity: new Map(), // sessionId -> transcript mtimeMs (status-less sessions only)
  usage: null,        // { fiveHour, weekly, weeklyOpus } each { pct, resetsAt }
  usageErr: null,
  usageMeterModels: null, // [{model,tokens,cost}] over 7d, for the model key in local mode
  usageAt: 0,
  sessions: [],
  today: null,
  burn: null,
  pctHistory: [],
  loggedRaw: false,
  rates: {},
  approveQueue: [],
  denies: [],   // {rule, at} for ~30s after a DENY, so the retry cannot be ALWAYS'd
  hookSecret: null,
  hookPort: PORT_DEFAULT,
  hookErr: null,
  lastHeadChangeAt: 0,
  globalSettings: {},
  pluginUUID: null,
};

function pickBucket(o) {
  if (!o || typeof o !== "object") return null;
  let pct = null;
  // The usage endpoint reports utilization on a 0–100 scale (e.g. 13 = 13%), so
  // use it as-is. An earlier 0–1 fraction heuristic mis-scaled exactly 1% to 100%.
  if (typeof o.utilization === "number") pct = o.utilization;
  const resetsAt = o.resets_at ?? o.resetsAt ?? null;
  return pct == null && !resetsAt ? null : { pct, resetsAt };
}

const USAGE_DELAY_BASE = 120_000;
let usageDelay = USAGE_DELAY_BASE;
let lastUsageAttempt = 0;

// Survive restarts without re-polling: reuse the last good reading for up to 30 min
const CACHE_FILE = path.join(PLUGIN_DIR, "usage-cache.json");
try {
  const c = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
  if (Date.now() - c.at < 30 * 60_000) { state.usage = c.usage; state.usageAt = c.at; }
} catch {}

async function pollUsage() {
  lastUsageAttempt = Date.now();
  try {
    const token = await platform.readToken();
    if (!token) throw new Error("no OAuth token in credentials file");
    const res = await fetch(USAGE_URL, {
      headers: {
        Authorization: `Bearer ${token}`,
        "anthropic-beta": "oauth-2025-04-20",
        "Content-Type": "application/json",
      },
    });
    if (res.status === 429) { usageDelay = Math.min(usageDelay * 2, 900_000); throw new Error(`usage endpoint HTTP 429 (backing off to ${usageDelay / 1000}s)`); }
    if (!res.ok) throw new Error(`usage endpoint HTTP ${res.status}`);
    usageDelay = USAGE_DELAY_BASE;
    const j = await res.json();
    if (!state.loggedRaw) {
      state.loggedRaw = true;
      log("usage raw shape:", JSON.stringify(j).slice(0, 1200));
    }
    const limits = Array.isArray(j.limits) ? j.limits : [];
    const fromLimit = (kind) => {
      const l = limits.find((x) => x.kind === kind);
      return l ? { pct: l.percent, resetsAt: l.resets_at } : null;
    };
    const scoped = limits.find((x) => x.kind === "weekly_scoped");
    // Every per-model bucket the account exposes, for the selectable model gauge
    const models = [];
    for (const l of limits) {
      if (l.kind !== "weekly_scoped") continue;
      const name = l.scope?.model?.display_name;
      if (name && typeof l.percent === "number") models.push({ name, pct: l.percent, resetsAt: l.resets_at ?? null });
    }
    for (const [key, name] of [["seven_day_opus", "Opus"], ["seven_day_sonnet", "Sonnet"]]) {
      const b = pickBucket(j[key]);
      if (b?.pct != null && !models.some((m) => m.name === name)) models.push({ name, pct: b.pct, resetsAt: b.resetsAt });
    }
    state.usage = {
      fiveHour: pickBucket(j.five_hour) ?? fromLimit("session"),
      weekly: pickBucket(j.seven_day) ?? fromLimit("weekly_all"),
      weeklyOpus: pickBucket(j.seven_day_opus),
      scopedPct: scoped?.percent ?? null,
      scopedName: scoped?.scope?.model?.display_name ?? null,
      models,
    };
    state.usageErr = null;
    state.usageAt = Date.now();
    const fp5 = state.usage.fiveHour?.pct;
    if (typeof fp5 === "number") {
      state.pctHistory.push({ t: state.usageAt, pct: fp5 });
      state.pctHistory = state.pctHistory.filter((h) => state.usageAt - h.t < 3.6e6);
    }
    try { fs.writeFileSync(CACHE_FILE, JSON.stringify({ usage: state.usage, at: state.usageAt })); } catch {}
    scheduleResetPoll();
  } catch (e) {
    state.usageErr = String(e.message ?? e);
    log("usage poll failed:", state.usageErr);
    // The gauges may have just flipped to fallback; make sure they have numbers.
    pollUsageMeter();
  }
  renderAll(["usage-session", "usage-weekly", "usage-model", "burn-rate"]);
}

// Poll right after a limit window resets so gauges don't sit on stale 100%
let resetTimer = null;
function scheduleResetPoll() {
  const deltas = [state.usage?.fiveHour?.resetsAt, state.usage?.weekly?.resetsAt]
    .filter(Boolean)
    .map((iso) => new Date(iso).getTime() - Date.now())
    .filter((d) => d > 0 && d < 6 * 3.6e6);
  if (!deltas.length) return;
  clearTimeout(resetTimer);
  resetTimer = setTimeout(pollUsage, Math.min(...deltas) + 8000);
}

// The models a Model key can rotate through: subscription buckets, or the local
// per-family split. One shape for both so the render/press paths agree.
function modelList(mode) {
  if (mode === "local") return state.usageMeterModels ?? [];
  return state.usage?.models ?? [];
}
// Index this key is showing: an explicit press wins, else the configured model
// (matched by family, since a name saved from API days won't equal "opus"), else
// the first (priciest / highest) entry.
function modelListIndex(context, list, want, mode) {
  const pressed = modelIdx.get(context);
  if (pressed != null && list.length) return pressed % list.length;
  if (!want || !list.length) return 0;
  const w = String(want).toLowerCase();
  const byName = list.findIndex((e) => String(e.name ?? e.model).toLowerCase() === w);
  if (byName >= 0) return byName;
  const fam = familyOf(w) ?? w;
  const byFam = list.findIndex((e) => String(e.model ?? e.name).toLowerCase() === fam);
  return byFam >= 0 ? byFam : 0;
}

// Which local window each gauge key needs when it falls back.
const GAUGE_WINDOW = { "usage-session": "5h", "usage-weekly": "7day", "usage-model": "7day" };

// Source for the gauge keys. Kept in one place so the poller and all three
// render cases can never disagree about which mode they are in.
function gaugeMode(kind) {
  const win = GAUGE_WINDOW[kind];
  const hasLocal = !!(win && state.usageMeter?.[win]);
  return gaugeSource({ usage: state.usage, usageErr: state.usageErr, usageAt: state.usageAt, now: Date.now() }, hasLocal);
}

// mtime of a session's transcript. The slugified path is only a hint (the
// Windows rule is unverified), so on a miss we locate <sessionId>.jsonl by name
// and remember which directory it was in — correct on any platform, and one
// scan per session rather than per tick.
const transcriptDirFor = new Map(); // sessionId -> project dir that holds it
async function transcriptMtime(s) {
  if (!s?.sessionId) return null;
  const file = `${s.sessionId}.jsonl`;
  const known = transcriptDirFor.get(s.sessionId);
  const tryPath = async (p) => { try { return (await fsp.stat(p)).mtimeMs; } catch { return null; } };
  if (known) {
    const mt = await tryPath(path.join(known, file));
    if (mt != null) return mt;
    transcriptDirFor.delete(s.sessionId);
  }
  const hint = transcriptPathFor(PROJECTS_DIR, s);
  if (hint) {
    const mt = await tryPath(hint);
    if (mt != null) { transcriptDirFor.set(s.sessionId, path.dirname(hint)); return mt; }
  }
  // Fall back to finding it by name (covers a slug rule we guessed wrong).
  let dirs;
  try { dirs = await fsp.readdir(PROJECTS_DIR, { withFileTypes: true }); } catch { return null; }
  for (const d of dirs) {
    if (!d.isDirectory()) continue;
    const dir = path.join(PROJECTS_DIR, d.name);
    const mt = await tryPath(path.join(dir, file));
    if (mt != null) { transcriptDirFor.set(s.sessionId, dir); return mt; }
  }
  return null;
}

// ---------- data: running sessions ----------
function pidAlive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

async function pollSessions() {
  try {
    const files = await fsp.readdir(SESSIONS_DIR).catch(() => []);
    const out = [];
    for (const f of files) {
      if (!f.endsWith(".json")) continue;
      try {
        const s = JSON.parse(await fsp.readFile(path.join(SESSIONS_DIR, f), "utf8"));
        if (s.pid && pidAlive(s.pid)) out.push(s);
      } catch {}
    }
    out.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
    // The VS Code extension writes no status at all, so for those sessions only,
    // stat the transcript to tell "mid-turn" from "idle". One stat per such
    // session per 5s tick; CLI sessions (which report status) cost nothing.
    for (const s of out) {
      if (s.status) continue;
      const mt = await transcriptMtime(s);
      if (mt != null) state.activity.set(s.sessionId, mt);
    }
    for (const id of [...state.activity.keys()]) {
      if (!out.some((s) => s.sessionId === id)) state.activity.delete(id);
    }
    // Runs on EVERY tick, deliberately outside the `changed` branch below: two
    // different prompts in one session are byte-identical to sessionSig, so a drop
    // gated on `changed` would never fire. `out` is used rather than state.sessions
    // because state has not been updated yet.
    if (state.approveQueue.length) {
      const now = Date.now();
      // Compare first, THEN baseline the newcomers: a request seeded on this very tick
      // has nothing to compare against yet and must not be dropped.
      const gone = new Set([
        ...staleIds(state.approveQueue, out, state.activity, now),
        ...expiredIds(state.approveQueue, now, HOLD_MS()),
      ]);
      state.approveQueue = seedBaselines(state.approveQueue, out, state.activity);
      if (gone.size) answerAndDrop([...gone], "session moved on or hold expired");
      // A deny block is time-based, so it can expire with nothing else changing. Repaint
      // when it does, or an ALWAYS key would stay greyed on a request it may now answer.
      const kept = pruneDenies(state.denies, now);
      if (kept.length !== state.denies.length) {
        state.denies = kept;
        if (!gone.size) renderApproveAll();   // answerAndDrop already repainted
      }
    }
    // Compare against the signature cached on the PREVIOUS tick. Recomputing
    // both sides with the same `now` would cancel the derived state out, so a
    // time-only transition (finished → idle at 60s) would never repaint.
    const nextSig = sessionSig(out, Date.now(), state.activity);
    const changed = nextSig !== lastSessionSig;
    lastSessionSig = nextSig;
    state.sessions = out;
    if (changed) renderAll(["sessions", "focus-session", "approver-status", "approver-waiting"]);
  } catch (e) {
    log("sessions poll failed:", String(e));
  }
}

// ---------- approver ----------
const APPROVE_KINDS = ["approve-allow", "approve-always", "approve-deny"];
const HOLD_MS = () => (Number(state.globalSettings.hookHoldS) || HOLD_S_DEFAULT) * 1000;
// The snippet's declared hook `timeout` must be longer than HOLD_MS(), or Claude Code's
// own client-side timeout races our expiry and always loses: expiredIds() only fires
// AFTER now - receivedAt > holdMs, checked on a 600ms ticker, so the plugin's answer can
// land up to holdMs + 600ms after receivedAt. Padding the declared timeout by this much
// gives the client a real margin instead of a bare (and losing) tie.
const TIMEOUT_PAD_S = 3;
let approveSeq = 0;
let hookServer = null;

const renderApproveAll = () => renderAll(APPROVE_KINDS);
const hasApproveKey = () => [...views.values()].some((v) => APPROVE_KINDS.includes(v.kind));

// "auth?" is for a REPEATED wrong-path signal, never a single stray 404 - any web page
// can trigger one of those with a no-cors POST to the port, and hookserver.js already
// clears its own record the moment a correctly-pathed request arrives. Re-filter by the
// window here too (rather than trust hookserver's own pruning) so the flag also decays
// on its own if no further bad requests ever arrive to prune it.
function authFlagged() {
  const hits = hookServer?.stats.badPathHits;
  if (!hits || hits.length < BADPATH_MIN_HITS) return false;
  const now = Date.now();
  return hits.filter((t) => now - t < BADPATH_WINDOW_MS).length >= BADPATH_MIN_HITS;
}

function noteHeadChange(prevId) {
  const now = head(state.approveQueue)?.id ?? null;
  if (now !== prevId) state.lastHeadChangeAt = Date.now();
}

// Answering {} frees the socket at once. Safety does not depend on it (the terminal
// prompt is live and answerable throughout) but the queue's honesty does.
function answerAndDrop(ids, why) {
  if (!ids.length) return;
  const prev = head(state.approveQueue)?.id ?? null;
  for (const id of ids) {
    const { queue, req } = resolve(state.approveQueue, id);
    state.approveQueue = queue;
    if (req) {
      req.ticket.respond(null);
      log(`approve: dropped ${req.toolName} (${why})`);
    }
  }
  noteHeadChange(prev);
  renderApproveAll();
}

function onHookRequest(payload, ticket) {
  // Metadata only. tool_input for a Write is an entire file, and claude-deck.log
  // lives in the plugin folder that README tells users to open and share.
  const toolName = String(payload?.tool_name ?? "");
  log(`approve: ${toolName} from ${path.basename(String(payload?.cwd ?? ""))}`);
  if (payload?.hook_event_name !== "PermissionRequest" || !toolName) return void ticket.respond(null);
  if (!hasApproveKey()) return void ticket.respond(null); // zero added latency when unused

  const req = {
    id: ++approveSeq,
    receivedAt: Date.now(),
    sessionId: payload.session_id ?? null,
    cwd: payload.cwd ?? "",
    toolName,
    toolInput: payload.tool_input ?? null,
    suggestions: payload.permission_suggestions ?? [],
    // Baselines are seeded by the first pollSessions tick that OBSERVES this request,
    // never here: state.sessions is up to 5s stale and would predate the status flip
    // that caused this very prompt, making the request look stale forever.
    statusSnapshot: null,
    activitySnapshot: null,
    baselined: false,
    ticket,
  };
  ticket.id = req.id;
  const prev = head(state.approveQueue)?.id ?? null;
  const { queue, evicted } = enqueue(state.approveQueue, req);
  state.approveQueue = queue;
  if (evicted) { evicted.ticket.respond(null); log(`approve: evicted ${evicted.toolName} (queue full at ${QUEUE_MAX})`); }
  noteHeadChange(prev);
  renderApproveAll();
}

const onHookDrop = (ticket) => {
  if (ticket.id == null) return;
  const prev = head(state.approveQueue)?.id ?? null;
  const { queue, req } = resolve(state.approveQueue, ticket.id);
  if (!req) return;
  state.approveQueue = queue;
  log(`approve: socket closed for ${req.toolName}`);
  // Must arm the settle window like answerAndDrop does, or a drop that promotes a new
  // head lets a double-tap answer a request the user never read.
  noteHeadChange(prev);
  renderApproveAll();
};

let ensuring = null;
let ensureAgain = false;
// Serialised: this function's own setGlobalSettings makes Stream Deck broadcast
// didReceiveGlobalSettings straight back, which would re-enter it while the first
// startHookServer is still pending - both would then bind the same port and the loser
// would set "port busy" while a healthy server is listening. A call that arrives while
// one is already in flight is not simply dropped, though: it sets a trailing flag so
// exactly one more pass runs once the in-flight one settles - otherwise a settings
// write that drops the secret during that window would never trigger the re-assert.
function ensureHookServer() {
  if (ensuring) { ensureAgain = true; return ensuring; }
  ensuring = ensureHookServerOnce().finally(() => {
    ensuring = null;
    if (ensureAgain) { ensureAgain = false; ensureHookServer(); }
  });
  return ensuring;
}

async function ensureHookServerOnce() {
  const gs = state.globalSettings;
  // Never regenerate over a secret we already hold: any global-settings write that
  // arrives without hookSecret would otherwise silently invalidate the URL the user
  // already pasted into ~/.claude/settings.json.
  let secret = typeof gs.hookSecret === "string" && gs.hookSecret.length >= 32 ? gs.hookSecret
             : state.hookSecret;
  const port = Number(gs.hookPort) > 0 ? Number(gs.hookPort) : PORT_DEFAULT;
  if (!secret) {
    // 24 random bytes -> 32 base64url chars. Stored in Stream Deck GLOBAL SETTINGS,
    // never in PLUGIN_DIR: deploy.sh does `rm -rf "$DST"`, which would wipe it and
    // silently break the hook. Merge, never clobber - `rates` lives here too.
    secret = randomBytes(24).toString("base64url");
    state.globalSettings = { ...gs, hookSecret: secret, hookPort: port };
    send({ event: "setGlobalSettings", context: state.pluginUUID, payload: state.globalSettings });
    log("approve: generated a new hook secret");
  } else if (gs.hookSecret !== secret) {
    // A foreign write - e.g. the Property Inspector resending its own stale snapshot -
    // dropped the secret from the persisted store. Put it back, or the next restart sees
    // no secret anywhere, mints a fresh one, and the URL the user already pasted into
    // ~/.claude/settings.json silently stops working.
    // This must NOT be nested under a `secret !== state.hookSecret` guard: in exactly
    // this case those two ARE equal, which is what made an earlier version dead code.
    state.globalSettings = { ...gs, hookSecret: secret, hookPort: port };
    send({ event: "setGlobalSettings", context: state.pluginUUID, payload: state.globalSettings });
    log("approve: re-asserted the hook secret after a foreign global-settings write");
  }
  state.hookSecret = secret;
  // Compare against what is actually BOUND - port AND secret, not port alone: if global
  // settings ever hand back a DIFFERENT valid 32+ char secret, state.hookSecret above is
  // overwritten, but a port-only check would leave the old server (still listening on
  // the old path) in place forever, and installSnippet() would hand out a URL that
  // server can never accept - unrecoverable without a restart. Also clear a stale
  // error here: gating this on !state.hookErr would wedge us into permanent "port busy"
  // once it was ever set.
  if (hookServer && hookServer.boundPort === port && hookServer.secret === secret) {
    if (state.hookErr) { state.hookErr = null; renderApproveAll(); }
    return;
  }
  const previous = hookServer;
  try {
    const next = await startHookServer({
      port, secret, onRequest: onHookRequest, onDrop: onHookDrop, log,
    });
    // Requests held by the old server belong to a socket we are about to drop.
    if (previous && state.approveQueue.length) {
      answerAndDrop(state.approveQueue.map((r) => r.id), "hook server rebinding");
    }
    hookServer = next;
    state.hookPort = next.boundPort;
    state.hookErr = null;
    if (previous) await previous.close();
  } catch (e) {
    state.hookErr = e.code === "EADDRINUSE" ? "port busy" : String(e.message ?? e);
    log("approve: hook server failed:", state.hookErr);
  }
  renderApproveAll();
}

// A FRAGMENT, not a whole document. `~/.claude/settings.json` already exists on any
// real install, and commonly holds credentials, so telling the user to paste
// `{"hooks":{...}}` over it would produce invalid JSON at best and destroy their
// settings at worst. The returned text is pure JSON with NO comments: it goes
// straight into a copy-button textarea and then straight into that file, and JSON has
// no comment syntax. The merge instructions live in the Property Inspector note instead
// (see pi/pi.html's "install" field), not in this string.
function installSnippet() {
  const url = `http://127.0.0.1:${state.hookPort}/permission/${state.hookSecret ?? "<secret>"}`;
  // Padded (see TIMEOUT_PAD_S above): the hold itself stays HOLD_MS()/1000.
  return hookFragment(url, HOLD_MS() / 1000 + TIMEOUT_PAD_S);
}

// Recursively collect .jsonl transcript files (including <uuid>/subagents/)
// whose mtime is at/after cutoffMs. Returns [{ path, size, mtimeMs }].
async function walkTranscripts(dir, cutoffMs) {
  const out = [];
  async function rec(d) {
    let entries;
    try { entries = await fsp.readdir(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { await rec(p); continue; }
      if (!e.name.endsWith(".jsonl")) continue;
      let st;
      try { st = await fsp.stat(p); } catch { continue; }
      if (st.mtimeMs < cutoffMs) continue;
      out.push({ path: p, size: st.size, mtimeMs: st.mtimeMs });
    }
  }
  await rec(dir);
  return out;
}

// ---------- data: today's activity (local JSONL, incremental-ish) ----------
const fileCache = new Map(); // path -> { size, mtime, msgs, tokens }
const todayKey = () => new Date().toISOString().slice(0, 10);
const localDay = (ts) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

async function pollToday() {
  try {
    const day = localDay(Date.now());
    const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
    let msgs = 0, tokens = 0;
    const chats = new Set();
    const files = await walkTranscripts(PROJECTS_DIR, dayStart.getTime());
    for (const st of files) {
      const fp = st.path;
        if (!fp.split(path.sep).includes("subagents")) chats.add(fp); // conversations only (cross-platform)
        const cached = fileCache.get(fp);
        if (cached && cached.size === st.size && cached.day === day) {
          msgs += cached.msgs; tokens += cached.tokens;
          continue;
        }
        let fMsgs = 0, fTokens = 0;
        try {
          const text = await fsp.readFile(fp, "utf8");
          // One assistant message streams as several snapshot lines, each
          // stamped with the whole request's usage — count each request once
          // (max, in case a later snapshot carries the final totals).
          const reqTok = new Map(); // message.id/requestId -> tokens
          const seenMsg = new Set();
          for (const line of text.split("\n")) {
            if (!line) continue;
            let j;
            try { j = JSON.parse(line); } catch { continue; }
            if (!j.timestamp || localDay(j.timestamp) !== day) continue;
            const mid = j.message?.id ?? j.requestId;
            if (j.type === "user") fMsgs++;
            else if (j.type === "assistant" && (!mid || !seenMsg.has(mid))) {
              if (mid) seenMsg.add(mid);
              fMsgs++;
            }
            const u = j.message?.usage;
            if (!u) continue;
            const tok = (u.input_tokens ?? 0) + (u.output_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
            if (mid) reqTok.set(mid, Math.max(reqTok.get(mid) ?? 0, tok));
            else fTokens += tok;
          }
          for (const tok of reqTok.values()) fTokens += tok;
        } catch { continue; }
        fileCache.set(fp, { size: st.size, day, msgs: fMsgs, tokens: fTokens });
        msgs += fMsgs; tokens += fTokens;
    }
    state.today = { chats: chats.size, msgs, tokens };
    renderAll(["today"]);
  } catch (e) {
    log("today poll failed:", String(e));
  }
}

// ---------- data: burn rate (incremental tail of recent transcripts) ----------
const hourTracker = new Map(); // file -> { offset, rest, events: [{t, tok}] }

async function pollBurn() {
  try {
    const now = Date.now();
    const scanCutoff = now - 90 * 60_000;
    const files = await walkTranscripts(PROJECTS_DIR, scanCutoff);
    for (const st of files) {
      const fp = st.path;
        let rec = hourTracker.get(fp);
        if (!rec || st.size < rec.offset || !rec.seen) rec = { offset: 0, rest: "", events: [], seen: new Map() };
        if (st.size > rec.offset) {
          const fh = await fsp.open(fp, "r");
          try {
            const len = st.size - rec.offset;
            const buf = Buffer.alloc(len);
            await fh.read(buf, 0, len, rec.offset);
            rec.offset = st.size;
            const lines = (rec.rest + buf.toString("utf8")).split("\n");
            rec.rest = lines.pop() ?? "";
            for (const line of lines) {
              if (!line) continue;
              let j;
              try { j = JSON.parse(line); } catch { continue; }
              const u = j.message?.usage;
              if (!u || !j.timestamp) continue;
              const tok = (u.input_tokens ?? 0) + (u.output_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
              if (!tok) continue;
              // Snapshot lines repeat one request's usage — one event per
              // request id, updated in place if a later snapshot grows.
              const mid = j.message?.id ?? j.requestId;
              const ev = mid && rec.seen.get(mid);
              if (ev) { ev.tok = Math.max(ev.tok, tok); continue; }
              const e = { t: new Date(j.timestamp).getTime(), tok };
              if (mid) rec.seen.set(mid, e);
              rec.events.push(e);
            }
          } finally { await fh.close(); }
        }
        rec.events = rec.events.filter((e) => now - e.t < 65 * 60_000);
        for (const [mid, ev] of rec.seen) if (now - ev.t >= 65 * 60_000) rec.seen.delete(mid);
        hourTracker.set(fp, rec);
    }
    let tokensHour = 0;
    for (const rec of hourTracker.values()) for (const e of rec.events) if (now - e.t < 3.6e6) tokensHour += e.tok;
    state.burn = { tokensHour, at: now };
    renderAll(["burn-rate"]);
  } catch (e) {
    log("burn poll failed:", String(e));
  }
}

// ---------- data: Usage key (per-window token volume + estimated cost) ----------
const usageFileCache = new Map(); // path -> { size, mtimeMs, requests }

async function pollUsageMeter(forceWins) {
  const wins = new Set();
  if (forceWins) for (const w of forceWins) wins.add(w);
  else for (const v of views.values()) {
    if (v.kind === "usage-meter") wins.add(v.settings?.window ?? "today");
    // Gauge keys need a local window too, but only while they're in fallback.
    else if (GAUGE_WINDOW[v.kind] && gaugeMode(v.kind) === "local") wins.add(GAUGE_WINDOW[v.kind]);
    // Burn Rate's ETA falls back to local 5h spend, so it needs that window too.
    else if (v.kind === "burn-rate" && gaugeMode("usage-session") === "local") wins.add("5h");
  }
  if (!wins.size) return; // gated: no Usage keys visible
  const now = Date.now();
  const cutoff = Math.min(...[...wins].map((w) => windowStartMs(w, now)));
  try {
    const files = await walkTranscripts(PROJECTS_DIR, cutoff);
    const seen = new Set();
    const lists = [];
    for (const { path: fp, size, mtimeMs } of files) {
      seen.add(fp);
      const c = usageFileCache.get(fp);
      if (c && c.size === size && c.mtimeMs === mtimeMs) { lists.push(c.requests); continue; }
      let text;
      try { text = await fsp.readFile(fp, "utf8"); } catch { continue; }
      const requests = parseRequests(text);
      usageFileCache.set(fp, { size, mtimeMs, requests });
      lists.push(requests);
    }
    for (const fp of usageFileCache.keys()) if (!seen.has(fp)) usageFileCache.delete(fp);
    const merged = mergeById(lists);
    const out = {};
    for (const w of wins) out[w] = aggregate(merged, windowStartMs(w, now), state.rates);
    state.usageMeter = out;
    // Per-model split for the model key (same scan, no extra I/O).
    if (wins.has("7day")) state.usageMeterModels = aggregateByModel(merged, windowStartMs("7day", now), state.rates);
    renderAll(["usage-meter", "usage-session", "usage-weekly", "usage-model", "burn-rate"]);
  } catch (e) {
    log("usage-meter poll failed:", String(e));
  }
}

// Projects time-to-cap from the trend of 5h utilization samples
function sessionEta() {
  // pctHistory is fed only from the subscription 5h percentage, so on an account
  // without one it stays empty forever and this used to read "measuring…"
  // indefinitely — implying a number was coming that never would. Say what is
  // actually true instead; the tok/hr figure above it is still real.
  if (gaugeMode("usage-session") !== "subscription") {
    const b5 = state.usageMeter?.["5h"];
    return b5 ? "$" + b5.cost.toFixed(2) + " last 5h" : "no cap";
  }
  const h = state.pctHistory;
  if (h.length < 2) return "measuring…";
  const latest = h[h.length - 1];
  const past = h.find((s) => latest.t - s.t >= 10 * 60_000) ?? h[0];
  const dt = latest.t - past.t;
  if (dt < 4 * 60_000) return "measuring…";
  const slope = (latest.pct - past.pct) / dt;
  if (slope <= 5e-8) return "steady";
  const msLeft = (100 - latest.pct) / slope;
  const resetMs = state.usage?.fiveHour?.resetsAt ? new Date(state.usage.fiveHour.resetsAt).getTime() - latest.t : Infinity;
  if (msLeft >= resetMs) return "resets first";
  const hh = Math.floor(msLeft / 3.6e6), mm = Math.round((msLeft % 3.6e6) / 6e4);
  return hh > 0 ? `cap in ~${hh}h ${mm}m` : `cap in ~${mm}m`;
}

// ---------- websocket / stream deck plumbing ----------
function argOf(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const views = new Map(); // context -> { kind, settings }
const cycle = new Map(); // context -> { idx, timer }
const focusIdx = new Map(); // context -> { i, sig } (sig = the pool it indexes)
const usageView = new Map(); // context -> "cost" | "tokens" (Usage key toggle)
const modelIdx = new Map(); // context -> index into the model list (Model key: press to rotate)
const shownReq = new Map();  // context -> the approve request id this key last PAINTED
const shownRule = new Map(); // context -> the ALWAYS rule text this key last PAINTED
let ws = null;
let animPhase = 0;
let lastSessionSig = ""; // previous tick's session signature (see pollSessions)

function send(obj) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
}
const setImage = (context, image) => send({ event: "setImage", context, payload: { image, target: 0 } });
const setTitle = (context) => send({ event: "setTitle", context, payload: { title: "", target: 0 } });
const showAlert = (context) => send({ event: "showAlert", context });

const kindOf = (action) => action.replace("dev.tapparello.claude-deck.", "");

function render(context, kind) {
  switch (kind) {
    case "usage-session": {
      const mode = gaugeMode("usage-session");
      if (mode === "local") return setImage(context, localGauge("LAST 5H", state.usageMeter?.["5h"], views.get(context)?.settings?.budget, usageView.get(context) ?? "cost"));
      if (mode !== "subscription") return setImage(context, gaugeKey("SESSION 5H", null, mode === "throttled" ? "throttled" : mode === "error" ? "sign in?" : "no data"));
      const b = state.usage?.fiveHour;
      return setImage(context, gaugeKey("SESSION 5H", b?.pct ?? null, b ? fmtReset(b.resetsAt) : "no data", b?.pct >= 90 ? animPhase : null));
    }
    case "usage-weekly": {
      const mode = gaugeMode("usage-weekly");
      if (mode === "local") return setImage(context, localGauge("LAST 7D", state.usageMeter?.["7day"], views.get(context)?.settings?.budget, usageView.get(context) ?? "cost"));
      if (mode !== "subscription") return setImage(context, gaugeKey("WEEKLY", null, mode === "throttled" ? "throttled" : mode === "error" ? "sign in?" : "no data"));
      const b = state.usage?.weekly;
      const u = state.usage;
      const sub = u?.scopedPct != null && u.scopedName
        ? `${u.scopedName} ${Math.round(u.scopedPct)}%`
        : u?.weeklyOpus?.pct != null ? `opus ${Math.round(u.weeklyOpus.pct)}%`
        : b ? fmtReset(b.resetsAt) : "no data";
      return setImage(context, gaugeKey("WEEKLY", b?.pct ?? null, sub, b?.pct >= 90 ? animPhase : null));
    }
    case "usage-model": {
      const mmode = gaugeMode("usage-model");
      if (mmode !== "subscription" && mmode !== "local") {
        return setImage(context, gaugeKey("MODEL 7D", null, mmode === "throttled" ? "throttled" : mmode === "error" ? "sign in?" : "no data"));
      }
      const list = modelList(mmode);
      const want = views.get(context)?.settings?.model;
      const i = modelListIndex(context, list, want, mmode);
      const pick = list[i];
      const head = ((pick?.name ?? pick?.model ?? want ?? "MODEL") + "").toUpperCase().slice(0, 8) + " 7D";
      const more = list.length > 1 ? ` ${i + 1}/${list.length}` : "";
      if (!pick) return setImage(context, usageMeterKey(head, "--", mmode === "local" ? "no data yet" : "no data", true));
      if (mmode === "local") {
        return setImage(context, localGauge(head + more, pick, views.get(context)?.settings?.budget, usageView.get(context) ?? "cost"));
      }
      return setImage(context, gaugeKey(head + more, pick.pct ?? null, pick.resetsAt ? fmtReset(pick.resetsAt) : "no data", pick.pct >= 90 ? animPhase : null));
    }
    case "burn-rate":
      return setImage(context, burnKey(state.burn?.tokensHour ?? null, sessionEta()));
    case "project": {
      const s = views.get(context)?.settings ?? {};
      const label = s.label || (s.path ? path.basename(s.path) : "");
      return setImage(context, labelKey("PROJECT", label || "configure", s.path ? "" : "set folder in settings"));
    }
    case "focus-session": {
      // Blocked sessions take priority: pressing goes straight to the one that
      // needs you, and the key advertises that with the reason + a warm accent.
      const blocked = blockedSessions(state.sessions, Date.now(), state.activity);
      const pool = blocked.length ? blocked : state.sessions;
      const fi = focusIdx.get(context);
      const poolSig = pool.map((x) => x.pid).join(",");
      // Only trust the remembered index while the pool is unchanged; otherwise
      // show the top of the pool rather than a session the user never focused.
      const s = pool.length ? (fi && fi.sig === poolSig ? pool[fi.i % pool.length] : pool[0]) : null;
      if (blocked.length) {
        const b = s ?? blocked[0];
        return setImage(context, labelKey("FOCUS", b.name ?? "session", String(b.waitingFor ?? "needs you"), C.warn, C.warn, true));
      }
      const anyWorking = state.sessions.some((x) => sessionState(x, Date.now(), state.activity.get(x.sessionId) ?? null) === "working");
      const facc = anyWorking ? C.info : C.dim;
      return setImage(context, labelKey("FOCUS", s ? s.name : `${state.sessions.length} sessions`, s ? sessionState(s, Date.now(), state.activity.get(s.sessionId) ?? null) : "press to cycle", facc, anyWorking ? C.info : null));
    }
    case "quick-prompt": {
      const s = views.get(context)?.settings ?? {};
      return setImage(context, labelKey("PROMPT", s.label || "configure", s.prompt ? "" : "set prompt in settings"));
    }
    case "custom": {
      const s = views.get(context)?.settings ?? {};
      return setImage(context, labelKey("CLAUDE", s.label || "custom", s.command ? "" : "set command in settings"));
    }
    case "sessions": {
      const cy = cycle.get(context);
      const n = state.sessions.length;
      if (cy && cy.idx >= 0 && state.sessions[cy.idx]) {
        const s = state.sessions[cy.idx];
        // Use the derived state, not the raw status: "waiting" is blocked-on-you,
        // and rendering it in success-green was the very bug phase 2 fixes.
        const st = sessionState(s, Date.now(), state.activity.get(s.sessionId) ?? null);
        const stLabel = { "needs-approval": "needs you", "input-needed": "input needed", working: "working", finished: "done", idle: "idle" }[st] ?? st;
        const stColor = st === "needs-approval" ? C.warn : st === "input-needed" ? C.ask : st === "working" ? C.info : C.dim;
        return setImage(context, linesKey(`${cy.idx + 1}/${n}`, [
          { text: (s.name ?? "session").slice(0, 11), big: false, color: C.text },
          { text: stLabel, color: stColor },
          { text: fmtAgo(s.startedAt ?? Date.now()) + " old", color: C.dim },
        ]));
      }
      // "waiting" means blocked on the human — never count that as working.
      const blocked = blockedSessions(state.sessions, Date.now(), state.activity).length;
      const busy = state.sessions.filter((s) => sessionState(s, Date.now(), state.activity.get(s.sessionId) ?? null) === "working").length;
      const sub = blocked > 0 ? `${blocked} needs you` : busy > 0 ? `${busy} working` : n > 0 ? "all idle" : "none running";
      const subCol = blocked > 0 ? C.warn : busy > 0 ? C.info : C.dim;
      return setImage(context, bigCountKey("CLAUDE CODE", n, sub, subCol, busy > 0 ? animPhase : null, blocked > 0 ? C.warn : busy > 0 ? C.info : null, blocked > 0));
    }
    case "today": {
      const t = state.today;
      return setImage(context, linesKey("TODAY", [
        { text: `${t?.chats ?? "--"} chats`, color: C.text },
        { text: `${fmtNum(t?.msgs)} msgs`, color: C.text },
        { text: `${fmtNum(t?.tokens)} tok`, color: C.accent },
      ]));
    }
    case "usage-meter": {
      const s = views.get(context)?.settings ?? {};
      const win = s.window ?? "today";
      const header = { today: "TODAY", month: "THIS MONTH", "7day": "7-DAY" }[win] ?? "TODAY";
      const view = usageView.get(context) ?? "cost";
      const agg = state.usageMeter?.[win];
      const suffix = s.label ? " · " + s.label : "";
      if (!agg) return setImage(context, usageMeterKey(header, "--", "no data", view === "cost"));
      if (view === "cost") return setImage(context, usageMeterKey(header, "$" + agg.cost.toFixed(2), "cost" + suffix, true));
      return setImage(context, usageMeterKey(header, fmtNum(agg.tokens), agg.in != null ? `${fmtNum(agg.in)} in · ${fmtNum(agg.out)} out` : "tokens" + suffix, false));
    }
    case "approver-status": {
      const s = views.get(context)?.settings ?? {};
      const resolved = resolveStatusKey(state.sessions, s.project ?? "", autoSlotFor(context), Date.now(), state.activity);
      const cy = cycle.get(context);
      // Only honour an in-flight cycle while the key opts into cycling, so
      // unchecking the box takes effect immediately instead of leaving the key
      // parked on a cycled session.
      const cycling = !!s.cycle && !!(cy && cy.idx >= 0);
      const entry = statusEntry(resolved, cycling ? cy.idx : null);
      const explicit = !!(s.project && s.project.trim());
      const name = s.label || entry.name || (s.project ?? "");
      let detail = "";
      if (cycling && resolved.count > 1) {
        const parent = entry.cwd ? path.basename(path.dirname(entry.cwd)) : "";
        detail = `${cy.idx + 1}/${resolved.count}${parent ? " · " + parent : ""}`;
      } else if (entry.waitingFor) {
        // why it's blocked, plus how long — "just asked" vs "stuck since coffee"
        const waited = entry.waitingSince ? fmtShort(Date.now() - entry.waitingSince) : "";
        detail = shortWait(entry.waitingFor) + (waited ? " · " + waited : "");
      } else if (entry.state === "finished") {
        detail = "just now"; // fmtAgo floors to minutes, so it would always read "0m"
      } else if (entry.state === "idle" && entry.statusAge != null) {
        detail = fmtAgo(Date.now() - entry.statusAge) + " idle";
      }
      const blockedNow = entry.state === "needs-approval" || entry.state === "input-needed";
      const fresh = blockedNow && (!entry.waitingSince || Date.now() - entry.waitingSince < PULSE_MS);
      return setImage(context, statusKey(name, entry.state, explicit ? resolved.count : 1, detail, entry.where, fresh ? animPhase : null));
    }
    case "approver-waiting": {
      // Dark and quiet until a session is actually blocked on you.
      const blocked = blockedSessions(state.sessions, Date.now(), state.activity);
      if (!blocked.length) {
        const n = state.sessions.length;
        return setImage(context, statusKey("WAITING", "quiet", 1, n ? `${n} session${n > 1 ? "s" : ""} ok` : "no sessions"));
      }
      const cy = cycle.get(context);
      const i = cy && cy.idx >= 0 ? cy.idx % blocked.length : 0;
      const b = blocked[i];
      const st = sessionState(b, Date.now(), state.activity.get(b.sessionId) ?? null);
      const since = b.status === "waiting" && b.statusUpdatedAt ? b.statusUpdatedAt : null;
      const waited = since ? fmtShort(Date.now() - since) : "";
      const why = shortWait(b.waitingFor ?? "") || "needs you";
      const fresh = !since || Date.now() - since < PULSE_MS;
      return setImage(context, statusKey(path.basename(b.cwd ?? "") || "claude", st, blocked.length, why + (waited ? " · " + waited : ""), sessionWhere(b), fresh ? animPhase : null));
    }
    case "approve-allow":
    case "approve-always":
    case "approve-deny": {
      const s = views.get(context)?.settings ?? {};
      const req = head(state.approveQueue);
      // Record what this key is PAINTING. Task 7's press guard compares against it,
      // so a press can never answer a request the user did not see.
      shownReq.set(context, req?.id ?? null);
      shownRule.set(context, kind === "approve-always" && req ? alwaysRule(req, !!s.sessionOnly) : null);
      const fresh = req && Date.now() - req.receivedAt < PULSE_MS;
      // A mis-pasted or stale URL 404s inside our own handler, so it IS countable - but
      // only REPEATED 404s are evidence of that; see authFlagged().
      const err = state.hookErr
        ?? (!state.approveQueue.length && authFlagged() ? "auth?" : null);
      return setImage(context, approveKey(kind, req, {
        sessionOnly: !!s.sessionOnly,
        label: s.label,
        err,
        depth: state.approveQueue.length,
        phase: fresh ? animPhase : null,
        denied: kind === "approve-always" && req ? denyBlock(state.denies, req, Date.now()) : null,
      }));
    }
  }
}

function renderAll(kinds) {
  for (const [context, v] of views) if (kinds.includes(v.kind)) render(context, v.kind);
}

// Slot for this auto (unbound) Status key among the visible ones, by physical
// position, so a row of auto keys shows different sessions (0 = most urgent).
function autoSlotFor(context) {
  const keys = [...views.entries()]
    .filter(([, v]) => v.kind === "approver-status" && !(v.settings?.project && v.settings.project.trim()))
    .map(([ctx, v]) => ({ context: ctx, device: v.device, row: v.row, col: v.col }));
  return autoSlot(keys, context);
}

// The full poller record for a pid — platform.focusWindow needs pid (macOS) and
// name/cwd (Windows), so callers must hand it the record, not a projection.
function sessionByPid(pid) {
  return state.sessions.find((s) => s.pid === pid) ?? null;
}

// ---------- platform adapter ----------
const OSA_TIMEOUT_MS = 8000;
// A blocked session can sit unanswered all night, and unlike the other ticker
// animations this state does not self-terminate. Breathe long enough to catch
// the eye, then hold static instead of pushing frames until morning.
const PULSE_MS = 120_000;

// Resolve on successful spawn, reject if the process can't be launched.
// Resolves once the child is spawned; a spawn failure surfaces as showAlert.
function spawnDetached(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { detached: true, stdio: "ignore" });
    child.once("error", reject);
    child.once("spawn", () => { child.unref(); resolve(); });
  });
}

// macOS: `open`; resolves on exit 0, rejects otherwise.
function openMac(args) {
  return new Promise((resolve, reject) => {
    execFile("open", args, (err) => (err ? reject(err) : resolve()));
  });
}

// macOS: run AppleScript, time-bounded twice — `with timeout` in-script plus
// execFile's own timeout (kills the child, calls back with an error).
function runOsa(lines) {
  return new Promise((resolve, reject) => {
    const args = [];
    for (const l of lines) { args.push("-e", l); }
    execFile("osascript", args, { timeout: OSA_TIMEOUT_MS }, (err) => (err ? reject(err) : resolve()));
  });
}

// macOS: write text to the clipboard via pbcopy stdin.
function pbcopy(text) {
  return new Promise((resolve, reject) => {
    const child = spawn("pbcopy");
    child.once("error", reject);
    child.stdin.once("error", reject);
    child.once("close", (code) => (code === 0 ? resolve() : reject(new Error("pbcopy exit " + code))));
    child.stdin.end(String(text ?? ""));
  });
}

// Lowercased match target for Focus Session (session name, else cwd basename).
function focusTarget(s) {
  const name = String(s.name ?? "").replace(/["'‘’“”]/g, "").slice(0, 40);
  return (name || path.basename(s.cwd ?? "")).toLowerCase();
}

const winPlatform = {
  launchDesktop() { return spawnDetached("explorer.exe", [desktopAppId]); },
  openUrl(url) { return spawnDetached("cmd.exe", ["/c", "start", "", url]); },
  runCustom(command) { return spawnDetached("cmd.exe", ["/c", "start", "", command]); },

  // Global quick-chat hotkey Ctrl+Alt+Space via keybd_event (verbatim from the
  // original quickChat). The `hotkey` arg is ignored on Windows.
  fireHotkey(_hotkey) {
    const ps = `
Add-Type -Namespace K -Name W -MemberDefinition '[DllImport("user32.dll")] public static extern void keybd_event(byte k, byte s, uint f, UIntPtr e);';
[K.W]::keybd_event(0x11,0,0,[UIntPtr]::Zero); [K.W]::keybd_event(0x12,0,0,[UIntPtr]::Zero); [K.W]::keybd_event(0x20,0,0,[UIntPtr]::Zero);
Start-Sleep -Milliseconds 60;
[K.W]::keybd_event(0x20,0,2,[UIntPtr]::Zero); [K.W]::keybd_event(0x12,0,2,[UIntPtr]::Zero); [K.W]::keybd_event(0x11,0,2,[UIntPtr]::Zero);`;
    return spawnDetached("powershell.exe", ["-NoProfile", "-WindowStyle", "Hidden", "-Command", ps]);
  },

  // Set-Clipboard + keybd_event chord + Ctrl+V + optional Enter (verbatim from
  // the original sendPrompt). `hotkey` ignored on Windows.
  pasteInto(_hotkey, text, enter) {
    const ps = `
Set-Clipboard -Value '${String(text).replace(/'/g, "''")}';
Add-Type -Namespace K -Name W -MemberDefinition '[DllImport("user32.dll")] public static extern void keybd_event(byte k, byte s, uint f, UIntPtr e);';
function P([byte]$k){[K.W]::keybd_event($k,0,0,[UIntPtr]::Zero)}; function R([byte]$k){[K.W]::keybd_event($k,0,2,[UIntPtr]::Zero)};
P 0x11; P 0x12; P 0x20; Start-Sleep -Milliseconds 60; R 0x20; R 0x12; R 0x11;
Start-Sleep -Milliseconds 800;
P 0x11; P 0x56; Start-Sleep -Milliseconds 60; R 0x56; R 0x11;
${enter ? "Start-Sleep -Milliseconds 200; P 0x0D; R 0x0D;" : ""}`;
    return spawnDetached("powershell.exe", ["-NoProfile", "-WindowStyle", "Hidden", "-Command", ps]);
  },

  // Bring the session's terminal window to front by title substring (verbatim
  // EnumWindows/SetForegroundWindow). execFile gives a real exit code.
  focusWindow(s) {
    const target = focusTarget(s);
    if (!target) return Promise.reject(new Error("no focus target"));
    const ps = `
$target = '${target.replace(/'/g, "''")}';
Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; using System.Text; public class W { public delegate bool EP(IntPtr h, IntPtr l); [DllImport("user32.dll")] public static extern bool EnumWindows(EP cb, IntPtr l); [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n); [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h); [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h); [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c); }';
$found = [IntPtr]::Zero;
[void][W]::EnumWindows({ param($h, $l) $sb = New-Object System.Text.StringBuilder 512; [void][W]::GetWindowText($h, $sb, 512); if ([W]::IsWindowVisible($h) -and $sb.ToString().ToLower().Contains($target)) { $script:found = $h; return $false }; return $true }, [IntPtr]::Zero);
if ($found -eq [IntPtr]::Zero) { exit 1 };
[void][W]::ShowWindow($found, 9); [void][W]::SetForegroundWindow($found); exit 0`;
    return new Promise((resolve, reject) => {
      execFile("powershell.exe", ["-NoProfile", "-WindowStyle", "Hidden", "-Command", ps], (err) => (err ? reject(err) : resolve()));
    });
  },

  // Windows Terminal (new foreground window) with a PowerShell fallback. The
  // whole fallback chain stays internal and settles the Promise once (spec §5.8).
  openTerminal(dir) {
    return new Promise((resolve, reject) => {
      const psFallback = () => {
        const fb = spawn("cmd.exe", ["/c", "start", "", "powershell", "-NoExit", "-Command", `cd '${dir}'; claude`], { detached: true, stdio: "ignore" });
        fb.once("error", reject);
        fb.once("spawn", () => { fb.unref(); resolve(); });
      };
      const wt = spawn("cmd.exe", ["/c", "start", "", "wt", "-w", "new", "-d", dir, "powershell", "-NoExit", "-Command", "claude"], { detached: true, stdio: "ignore" });
      wt.once("error", psFallback);
      wt.once("exit", (code) => { if (code === 0) resolve(); else psFallback(); });
      wt.unref();
    });
  },

  // OAuth token from the credentials file (Windows/Linux location).
  async readToken() {
    try {
      const raw = await fsp.readFile(CREDS_FILE, "utf8");
      return parseKeychainToken(raw);
    } catch {
      return null;
    }
  },
};

const macPlatform = {
  launchDesktop() {
    return openMac(["-b", "com.anthropic.claudefordesktop"]).catch(() => openMac(["-a", "Claude"]));
  },
  openUrl(url) { return openMac([url]); },
  runCustom(command) {
    const c = classifyCustomCommand(command, { home: os.homedir(), exists: fs.existsSync });
    if (!c) return Promise.reject(new Error("empty command"));
    return c.mode === "open" ? openMac([c.arg]) : openMac(["-a", c.arg]);
  },
  openTerminal(dir) {
    const d = escapeAppleScript(dir);
    return runOsa([
      "with timeout of 7 seconds",
      'tell application "Terminal"',
      `do script "cd " & quoted form of "${d}" & " && claude"`,
      "activate",
      "end tell",
      "end timeout",
    ]);
  },
  fireHotkey(hotkey) {
    const clause = hotkeyClause(parseHotkey(hotkey));
    if (!clause) return Promise.reject(new Error("no hotkey configured"));
    return runOsa([
      "with timeout of 7 seconds",
      `tell application "System Events" to ${clause}`,
      "end timeout",
    ]);
  },
  pasteInto(hotkey, text, enter) {
    const clause = hotkeyClause(parseHotkey(hotkey));
    if (!clause) return Promise.reject(new Error("no hotkey configured"));
    const lines = [
      "with timeout of 7 seconds",
      'tell application "System Events"',
      `  ${clause}`,
      "  delay 0.8",
      '  keystroke "v" using {command down}',
    ];
    if (enter) { lines.push("  delay 0.2", "  key code 36"); }
    lines.push("end tell", "end timeout");
    return pbcopy(text).then(() => runOsa(lines));
  },
  // Bring the exact window hosting this session to the front. The GUI app is
  // resolved from the session PID's ancestry; then, best-effort per app:
  //   Terminal -> raise the window whose tab tty matches the session tty
  //   VS Code  -> raise the window whose title contains the session's folder
  //   otherwise -> just activate the app.
  // Falls back to activating the app if the window match/permission fails, so
  // it degrades to "app to front" rather than nothing. Terminal needs
  // Automation->Terminal; VS Code needs Accessibility.
  focusWindow(s) {
    const pid = s?.pid;
    if (!pid) return Promise.reject(new Error("no pid for session"));
    const ps = (args) =>
      new Promise((resolve, reject) =>
        execFile("ps", args, { timeout: OSA_TIMEOUT_MS }, (e, out) => (e ? reject(e) : resolve(String(out)))));
    return ps(["-axo", "pid=,ppid=,comm="]).then((out) => {
      const bundle = hostAppForPid(parsePsTree(out), pid);
      if (!bundle) throw new Error("no host app for pid " + pid);
      const activateApp = () => openMac([bundle]);
      const strat = focusStrategyForBundle(bundle);
      // Why the logging: every failure here falls back to plain app activation
      // (all windows up, last-used focused), which is indistinguishable from
      // "the window match found nothing". Without a reason in the log there is
      // no way to tell a permission denial from a tty mismatch.
      const fallback = (why) => (e) => {
        log(`focusWindow: ${why} for pid ${pid} (${bundle}) -> activating app instead:`, String(e?.message ?? e));
        return activateApp();
      };
      if (strat === "terminal") {
        return ps(["-o", "tty=", "-p", String(pid)]).then((t) => {
          const tty = t.trim();
          if (!tty || tty === "??") {
            log(`focusWindow: no tty for pid ${pid} -> activating app instead`);
            return activateApp();
          }
          log(`focusWindow: terminal strategy, pid ${pid}, tty ${tty}`);
          return runOsa(terminalFocusScript(tty)).catch(fallback("terminal tty match failed"));
        }).catch(fallback("tty lookup failed"));
      }
      if (strat === "vscode") {
        const base = path.basename(s.cwd ?? "");
        if (!base) return activateApp();
        const esc = escapeAppleScript(base);
        return runOsa([
          "with timeout of 7 seconds",
          'tell application "System Events"',
          '  tell process "Code"',
          "    set matched to false",
          "    repeat with w in windows",
          `      if (name of w) contains "${esc}" then`,
          '        perform action "AXRaise" of w',
          "        set frontmost to true",
          "        set matched to true",
          "        exit repeat",
          "      end if",
          "    end repeat",
          '    if not matched then error "not found"',
          "  end tell",
          "end tell",
          "end timeout",
        ]).catch(fallback("vscode window match failed"));
      }
      return activateApp();
    });
  },

  // OAuth token from the login Keychain (service "Claude Code-credentials"),
  // falling back to the credentials file if a user exported it.
  readToken() {
    return new Promise((resolve) => {
      execFile(
        "security",
        ["find-generic-password", "-s", "Claude Code-credentials", "-w"],
        { timeout: OSA_TIMEOUT_MS },
        async (err, out) => {
          const tok = err ? null : parseKeychainToken(out);
          if (tok) return resolve(tok);
          try {
            const raw = await fsp.readFile(CREDS_FILE, "utf8");
            resolve(parseKeychainToken(raw));
          } catch {
            resolve(null);
          }
        },
      );
    });
  },
};

const platform = IS_MAC ? macPlatform : winPlatform;

// Uniform Stream Deck feedback: OK on resolve, Alert on reject.
// Nothing here needs a thumbs-up: either the world visibly changed (an app came
// forward, a terminal opened) or the key itself re-renders. The checkmark only
// covered the key image. Failures still alert, which IS information.
function act(context, p) {
  p.catch(() => showAlert(context));
}

// Same, but silent on success: for "take me to that window" presses, the window
// coming forward IS the feedback, and the checkmark overlay just hides the key's
// state (which is the thing you pressed it to act on). Failures still alert.


// ---------- key actions ----------
function onKeyDown(context, kind) {
  switch (kind) {
    case "usage-session":
    case "usage-weekly":
      if (gaugeMode(kind) === "local") {
        // Local mode has no reset to refresh toward, so the press is better spent
        // toggling cost <-> tokens (same gesture as the Usage key).
        usageView.set(context, (usageView.get(context) ?? "cost") === "cost" ? "tokens" : "cost");
        pollUsageMeter();
        return render(context, kind);
      }
      if (Date.now() - lastUsageAttempt > 30_000) pollUsage();
      return;
    case "today":
      pollToday();
      return;
    case "sessions": {
      const n = state.sessions.length;
      if (n === 0) return showAlert(context);
      const cy = cycle.get(context) ?? { idx: -1, timer: null };
      cy.idx = (cy.idx + 1) % n;
      if (cy.timer) clearTimeout(cy.timer);
      cy.timer = setTimeout(() => { cycle.set(context, { idx: -1, timer: null }); render(context, "sessions"); }, 4000);
      cycle.set(context, cy);
      return render(context, "sessions");
    }
    case "usage-model": {
      // Press rotates through the models rather than nudging a refresh — the
      // poller already keeps them current, and one key can then cover them all.
      const mode = gaugeMode("usage-model");
      const list = modelList(mode);
      if (list.length > 1) {
        const cur = modelListIndex(context, list, views.get(context)?.settings?.model, mode);
        modelIdx.set(context, (cur + 1) % list.length);
      } else if (mode === "local") pollUsageMeter();
      else if (Date.now() - lastUsageAttempt > 30_000) pollUsage();
      return render(context, "usage-model");
    }
    case "burn-rate":
      pollBurn();
      return;
    case "project": {
      const s = views.get(context)?.settings ?? {};
      if (!s.path) return showAlert(context);
      return act(context, platform.openTerminal(s.path));
    }
    case "focus-session": {
      // Cycle within the blocked set when any session needs you, else all sessions.
      const blocked = blockedSessions(state.sessions, Date.now(), state.activity);
      const pool = blocked.length ? blocked : state.sessions;
      const n = pool.length;
      if (!n) return showAlert(context);
      // Reset to the top when the pool changed (a session blocked/unblocked or
      // went away), so the first press always lands on the most urgent rather
      // than wherever a stale index happened to point.
      const poolSig = pool.map((s) => s.pid).join(",");
      const prev = focusIdx.get(context);
      const i = prev?.sig === poolSig ? (prev.i + 1) % n : 0;
      focusIdx.set(context, { i, sig: poolSig });
      act(context, platform.focusWindow(pool[i]));
      return render(context, "focus-session");
    }
    case "quick-prompt": {
      const s = views.get(context)?.settings ?? {};
      if (!s.prompt) return showAlert(context);
      return act(context, platform.pasteInto(s.hotkey, s.prompt, !!s.enter));
    }
    case "custom": {
      const s = views.get(context)?.settings ?? {};
      if (!s.command) return showAlert(context);
      return act(context, platform.runCustom(s.command));
    }
    case "launch": return act(context, platform.launchDesktop());
    case "quick-chat": {
      const s = views.get(context)?.settings ?? {};
      return act(context, platform.fireHotkey(s.hotkey));
    }
    case "open-web": return act(context, platform.openUrl("https://claude.ai/new"));
    case "claude-code": return act(context, platform.openTerminal(DEFAULT_CODE_DIR));
    case "usage-meter": {
      usageView.set(context, (usageView.get(context) ?? "cost") === "cost" ? "tokens" : "cost");
      pollUsageMeter();
      return render(context, "usage-meter");
    }
    case "approver-status": {
      // Press takes you to that session's window — the point of seeing "Needs
      // approval" is to go answer it. Opt in per key ("Press cycles through
      // sessions") to instead walk the candidate list on each press; off by
      // default so a row of keys keeps its fixed slots (1st/2nd/3rd busiest),
      // which is the point of having several of them.
      const s = views.get(context)?.settings ?? {};
      const resolved = resolveStatusKey(state.sessions, s.project ?? "", autoSlotFor(context), Date.now(), state.activity);
      if (!resolved.count) return showAlert(context);
      const cycling = !!s.cycle && resolved.count > 1;
      let idx = resolved.index;
      if (cycling) {
        const cy = cycle.get(context) ?? { idx: resolved.index - 1, timer: null };
        cy.idx = (cy.idx + 1) % resolved.count;
        if (cy.timer) clearTimeout(cy.timer);
        cy.timer = setTimeout(() => { cycle.set(context, { idx: -1, timer: null }); render(context, "approver-status"); }, 4000);
        cycle.set(context, cy);
        idx = cy.idx;
      }
      const entry = statusEntry(resolved, cycling ? idx : null);
      render(context, "approver-status");
      return act(context, platform.focusWindow(sessionByPid(entry.pid)));
    }
    case "approver-waiting": {
      // Dedicated "who needs me" key: press focuses the front blocked session,
      // repeated presses walk the rest.
      const blocked = blockedSessions(state.sessions, Date.now(), state.activity);
      if (!blocked.length) return showAlert(context);
      const cy = cycle.get(context) ?? { idx: -1, timer: null };
      cy.idx = (cy.idx + 1) % blocked.length;
      if (cy.timer) clearTimeout(cy.timer);
      cy.timer = setTimeout(() => { cycle.set(context, { idx: -1, timer: null }); render(context, "approver-waiting"); }, 4000);
      cycle.set(context, cy);
      render(context, "approver-waiting");
      return act(context, platform.focusWindow(blocked[cy.idx]));
    }
    case "approve-allow":
    case "approve-always":
    case "approve-deny": {
      // Wrapped: a double-resolve throws ERR_HTTP_HEADERS_SENT synchronously, and
      // onKeyDown runs bare off the websocket handler - an escape kills every key.
      try {
        if (state.hookErr) return showAlert(context);
        const s = views.get(context)?.settings ?? {};
        const d = pressDecision({
          queue: state.approveQueue,
          shownId: shownReq.get(context) ?? null,
          lastHeadChangeAt: state.lastHeadChangeAt,
          now: Date.now(),
        });
        if (d.action === "none") return;
        if (d.action === "alert") { renderApproveAll(); return showAlert(context); }

        const which = kind.slice("approve-".length); // allow | always | deny
        // Decide BEFORE resolving: a refusal must not consume the request, or
        // fat-fingering the greyed ALWAYS key would wipe it off ALLOW and DENY too.
        const target = head(state.approveQueue);
        const body = decisionBody(which, target, { sessionOnly: !!s.sessionOnly });
        // Compare the rule against what this key actually PAINTED (shownRule), not
        // against a value re-derived from the same object - that would be `x === x`.
        const ruleOk = kind !== "approve-always"
          || (shownRule.get(context) != null && alwaysRule(target, !!s.sessionOnly) === shownRule.get(context));
        // Same call as the renderer's, so a key that painted "just denied" is exactly
        // the key that refuses. Checked here rather than folded into decisionBody
        // because the block is time-based state, and approve.js stays pure.
        const denied = which === "always" ? denyBlock(state.denies, target, Date.now()) : null;
        if (!body || !ruleOk || denied) {
          const why = denied ?? (!body ? "no single safe rule" : "rule is not what was shown");
          log(`approve: refused ${which} for ${target.toolName} (${why})`);
          renderApproveAll();
          return showAlert(context);
        }

        const { queue, req } = resolve(state.approveQueue, d.id);
        if (!req) { renderApproveAll(); return showAlert(context); }
        state.approveQueue = queue;
        req.ticket.respond(body);
        // Remember the deny BEFORE the retry arrives (~1.8s on-device), so the retry is
        // already blocked by the time it paints.
        if (which === "deny") state.denies = rememberDeny(state.denies, req, Date.now());
        log(`approve: ${which} ${req.toolName}${which === "always" ? ` as ${shownRule.get(context)}` : ""}`);
        state.lastHeadChangeAt = Date.now();
        renderApproveAll();
      } catch (e) {
        log("approve press failed:", e?.stack ?? String(e));
        showAlert(context);
      }
      return;
    }
  }
}

// ---------- selftest mode (no Stream Deck needed) ----------
if (process.argv.includes("--selftest")) {
  (async () => {
    log("selftest: polling usage…");
    await pollUsage();
    log("selftest usage:", state.usage ? JSON.stringify(state.usage) : `ERROR: ${state.usageErr}`);
    await pollSessions();
    log("selftest sessions:", state.sessions.map((s) => `${s.name}[${s.status}]`).join(", ") || "(none)");
    log("selftest states:", state.sessions.map((s) => `${s.name}=${sessionState(s, Date.now(), state.activity.get(s.sessionId) ?? null)}${s.waitingFor ? "(" + s.waitingFor + ")" : ""}`).join(", ") || "(none)");
    log("selftest blocked:", blockedSessions(state.sessions, Date.now(), state.activity).map((s) => s.name).join(", ") || "(none)");
    log("selftest status (auto k0):", JSON.stringify(statusEntry(resolveStatusKey(state.sessions, "", 0, Date.now(), state.activity))));
    const demo0 = state.sessions[0];
    if (demo0) {
      const proj = path.basename(demo0.cwd ?? "");
      const r = resolveStatusKey(state.sessions, proj, 0, Date.now(), state.activity);
      log(`selftest status (explicit ${proj}) count=${r.count}:`, JSON.stringify(statusEntry(r)));
    }
    await pollToday();
    log("selftest today:", JSON.stringify(state.today));
    await pollUsageMeter(["5h"]);
    await pollBurn();
    log("selftest burn:", JSON.stringify(state.burn), "eta:", sessionEta());
    await pollUsageMeter(["5h", "today", "month", "7day"]);
    log("selftest usage-meter:", JSON.stringify(state.usageMeter));
    log("selftest per-model 7d:", JSON.stringify(state.usageMeterModels));
    // End-to-end hook check on an ephemeral port: this is the only automated
    // coverage of the intake path, since plugin.js has no unit-test harness.
    const secret = randomBytes(24).toString("base64url");
    let got = null;
    const srv = await startHookServer({
      port: 0, secret, log, onRequest: (payload, ticket) => { got = payload; ticket.respond(decisionBody("allow", {})); },
    });
    const res = await fetch(`http://127.0.0.1:${srv.boundPort}/permission/${secret}`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ hook_event_name: "PermissionRequest", tool_name: "Bash", tool_input: { command: "npm test" } }),
    });
    const body = await res.json();
    log("selftest hook:", res.status, "payload tool:", got?.tool_name,
        "decision:", body?.hookSpecificOutput?.decision?.behavior);
    log("selftest approver config: holdS=", HOLD_S_DEFAULT, "portDefault=", PORT_DEFAULT, "queueMax=", QUEUE_MAX);
    await srv.close();
    if (res.status !== 200 || got?.tool_name !== "Bash" || body?.hookSpecificOutput?.decision?.behavior !== "allow") {
      log("selftest hook FAILED");
      process.exit(1);
    }
    process.exit(0);
  })().catch((e) => { log("selftest crashed:", e?.stack ?? String(e)); process.exit(1); });
} else {
  // A throw in one key's path must not take the others with it. Scoped to the plugin
  // branch on purpose: at module scope these handlers also cover the selftest IIFE,
  // which has no .catch(), so a selftest crash would exit 0 and CI would go green on a
  // broken build. (Measured.)
  process.on("uncaughtException", (e) => log("uncaughtException:", e?.stack ?? String(e)));
  process.on("unhandledRejection", (e) => log("unhandledRejection:", e?.stack ?? String(e)));

  const port = argOf("-port");
  const pluginUUID = argOf("-pluginUUID");
  const registerEvent = argOf("-registerEvent");
  log(`starting: port=${port} uuid=${pluginUUID}`);

  ws = new WebSocket(`ws://127.0.0.1:${port}`);
  ws.on("open", () => {
    state.pluginUUID = pluginUUID;
    send({ event: registerEvent, uuid: pluginUUID });
    log("registered with Stream Deck");
    send({ event: "getGlobalSettings", context: pluginUUID });
    if (Date.now() - state.usageAt > 90_000) pollUsage();
    pollSessions();
    pollToday();
  });
  ws.on("close", () => { log("socket closed, exiting"); process.exit(0); });
  ws.on("error", (e) => { log("socket error:", String(e)); });
  ws.on("message", (data) => {
    let msg;
    try { msg = JSON.parse(data.toString()); } catch { return; }
    const { event, context, action } = msg;
    if (event === "willAppear" && action) {
      views.set(context, {
        kind: kindOf(action),
        settings: msg.payload?.settings ?? {},
        // Device + physical position: used to give several auto Status keys a
        // stable slot, numbered per device (two Stream Decks are live at once).
        device: msg.device ?? null,
        row: msg.payload?.coordinates?.row ?? null,
        col: msg.payload?.coordinates?.column ?? null,
      });
      setTitle(context);
      render(context, kindOf(action));
      if (kindOf(action) === "usage-meter" || GAUGE_WINDOW[kindOf(action)]) pollUsageMeter();
    } else if (event === "willDisappear") {
      const wasApproveKey = APPROVE_KINDS.includes(views.get(context)?.kind);
      views.delete(context);
      cycle.delete(context);
      focusIdx.delete(context);
      usageView.delete(context);
      modelIdx.delete(context);
      // Deferred by a second: Stream Deck emits every willDisappear for the outgoing
      // page BEFORE any willAppear for the incoming one, so an immediate flush would
      // destroy a live queue when an identical key reappears milliseconds later. Gated
      // on the DEPARTING key actually being an Approve kind - hasApproveKey()/
      // approveQueue can only ever be affected by one of those, so a page switch on a
      // large deck must not queue one of these timers per key on the page.
      if (wasApproveKey) {
        setTimeout(() => {
          if (!hasApproveKey() && state.approveQueue.length) {
            answerAndDrop(state.approveQueue.map((r) => r.id), "no Approve key visible");
          }
        }, 1000);
      }
    } else if (event === "didReceiveSettings" && action) {
      const v = views.get(context);
      if (v) { v.settings = msg.payload?.settings ?? {}; render(context, v.kind); if (v.kind === "usage-meter" || GAUGE_WINDOW[v.kind]) pollUsageMeter(); }
    } else if (event === "didReceiveGlobalSettings") {
      state.globalSettings = msg.payload?.settings ?? {};
      state.rates = state.globalSettings.rates ?? {};
      pollUsageMeter();
      ensureHookServer();
    } else if (event === "sendToPlugin" && action) {
      if (msg.payload?.cmd === "getModels") {
        send({ event: "sendToPropertyInspector", context, payload: { models: (state.usage?.models ?? []).map((m) => m.name) } });
      }
      if (msg.payload?.cmd === "getInstall") {
        send({ event: "sendToPropertyInspector", context, payload: {
          install: { port: state.hookPort, holdS: HOLD_MS() / 1000, snippet: installSnippet(), error: state.hookErr },
        } });
      }
    } else if (event === "keyDown" && action) {
      onKeyDown(context, kindOf(action));
    }
  });

  (function usageLoop() { setTimeout(async () => { await pollUsage(); usageLoop(); }, usageDelay); })();
  setInterval(pollSessions, 5_000);
  setInterval(pollToday, 300_000);
  pollBurn();
  setInterval(pollBurn, 60_000);
  setInterval(pollUsageMeter, 60_000);
  // Animation ticker: busy-session dots + red pulse on gauges at 90%+
  setInterval(() => {
    animPhase = (animPhase + 1) % 3;
    const kinds = [];
    if (state.sessions.some((s) => sessionState(s, Date.now(), state.activity.get(s.sessionId) ?? null) === "working")) kinds.push("sessions");
    if (state.usage?.fiveHour?.pct >= 90) kinds.push("usage-session");
    if (state.usage?.weekly?.pct >= 90) kinds.push("usage-weekly");
    if ((state.usage?.models ?? []).some((m) => m.pct >= 90)) kinds.push("usage-model");
    // Local/budget rings live outside state.usage, so gate them separately or a
    // ring at 98% would sit perfectly still while README promises a pulse.
    for (const [k, win] of Object.entries(GAUGE_WINDOW)) {
      if (gaugeMode(k) !== "local") continue;
      const agg = k === "usage-model" ? (state.usageMeterModels ?? [])[0] : state.usageMeter?.[win];
      const bud = [...views.values()].find((v) => v.kind === k)?.settings?.budget;
      if (agg && (budgetPct(agg.cost, bud) ?? 0) >= 90) kinds.push(k);
    }
    // A session blocked on you makes its keys breathe — far easier to catch than
    // a static colour. Gated on there actually being one, so a calm deck is idle.
    const freshBlocked = blockedSessions(state.sessions, Date.now(), state.activity)
      .some((b) => !b.statusUpdatedAt || Date.now() - b.statusUpdatedAt < PULSE_MS);
    if (freshBlocked) kinds.push("approver-status", "approver-waiting");
    // With a 20s hold, PULSE_MS (120s) never bounds anything, so a non-empty queue
    // is the right gate. Without this the keys would only repaint at 5s/30s and the
    // breath would be erratic frames instead of a pulse.
    if (state.approveQueue.length) {
      // Expire here as well as in pollSessions: this 600ms ticker, not the 5s poll, is
      // what actually bounds how late our answer can land - up to HOLD_MS + 600ms after
      // receivedAt. The snippet's declared timeout is padded past HOLD_MS (see
      // TIMEOUT_PAD_S/installSnippet) specifically so that stays inside Claude Code's own
      // deadline instead of losing the race against it.
      const dead = expiredIds(state.approveQueue, Date.now(), HOLD_MS());
      if (dead.length) answerAndDrop(dead, "hold expired");
      if (state.approveQueue.length) kinds.push(...APPROVE_KINDS);
    }
    if (kinds.length && [...views.values()].some((v) => kinds.includes(v.kind))) renderAll(kinds);
    // Safety net: a reset time has passed but we still show pre-reset data (missed timer / resume from sleep)
    const expired = [state.usage?.fiveHour, state.usage?.weekly]
      .some((b) => b?.resetsAt && Date.now() - new Date(b.resetsAt).getTime() > 5000);
    if (expired && !state.usageErr && Date.now() - lastUsageAttempt > 30_000) pollUsage();
  }, 600);
  // Keep countdowns ("1h 5m left") fresh between polls
  setInterval(() => {
    renderAll(["usage-session", "usage-weekly", "usage-model", "burn-rate", "approver-status", "approver-waiting", "focus-session", ...APPROVE_KINDS]);
    // Self-heal a failed bind: nothing else retries after the initial attempts.
    if (state.hookErr) ensureHookServer();
  }, 30_000);
}
