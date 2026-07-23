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
import { escapeAppleScript, parseHotkey, hotkeyClause, classifyCustomCommand, parseKeychainToken } from "./osa.js";

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
};
const pctColor = (p) => (p == null ? C.dim : p >= 85 ? C.bad : p >= 60 ? C.warn : C.ok);
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Claude-style spark (12 tapered rays), baked centered at (120,24), ~30px wide
const SPARK_PATH = "M121.79 21.82 L120.60 9.01 L118.39 21.68 Z M122.56 22.82 L125.12 14.49 L119.57 21.21 Z M122.81 24.26 L131.48 16.90 L121.02 21.37 Z M122.18 25.79 L130.19 24.41 L122.32 22.39 Z M121.18 26.56 L132.55 30.75 L122.79 23.57 Z M119.74 26.81 L125.52 32.93 L122.63 25.02 Z M118.21 26.18 L119.40 38.99 L121.61 26.32 Z M117.44 25.18 L115.03 33.25 L120.43 26.79 Z M117.19 23.74 L108.26 31.26 L118.98 26.63 Z M117.82 22.21 L110.11 23.60 L117.68 25.61 Z M118.82 21.44 L107.58 17.32 L117.21 24.43 Z M120.26 21.19 L114.32 14.81 L117.37 22.98 Z";
const sparkAt = (x, y, color = C.accent, opacity = 1, scale = 1) =>
  `<g transform="translate(${x} ${y}) scale(${scale}) translate(-120 -24)"><path d="${SPARK_PATH}" fill="${color}" stroke="${color}" stroke-width="0.8" stroke-linejoin="round" opacity="${opacity}"/></g>`;

// ---------- svg key renderers (144x144) ----------
// Faint watermark behind data keys: the real Claude logo when deploy.ps1 supplied
// one (local-assets), otherwise the drawn spark so the OSS build still gets texture.
let WATERMARK;
try {
  const b64 = fs.readFileSync(path.join(PLUGIN_DIR, "imgs", "launch.png")).toString("base64");
  WATERMARK = `<image xlink:href="data:image/png;base64,${b64}" href="data:image/png;base64,${b64}" x="24" y="24" width="96" height="96" opacity="0.12"/>`;
} catch {
  WATERMARK = sparkAt(72, 76, C.accent, 0.08, 2.4);
}

function svgWrap(inner) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="144" height="144" viewBox="0 0 144 144"><rect width="144" height="144" rx="18" fill="${C.bg}"/>${WATERMARK}${inner}</svg>`;
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
    <text x="14" y="27" font-family="Segoe UI, sans-serif" font-size="17" font-weight="600" letter-spacing="0.5" fill="${C.dim}">${esc(label)}</text>
    <text x="72" y="78" text-anchor="middle" font-family="Segoe UI, sans-serif" font-size="${has ? 46 : 34}" font-weight="700" fill="${has ? col : C.dim}">${has ? Math.round(p) + "%" : "--"}</text>
    <rect x="14" y="90" width="116" height="12" rx="6" fill="${C.track}"/>
    ${has ? `<rect x="14" y="90" width="${Math.max(8, (116 * p) / 100)}" height="12" rx="6" fill="${col}"/>` : ""}
    <text x="72" y="128" text-anchor="middle" font-family="Segoe UI, sans-serif" font-size="16" fill="${C.dim}">${esc(sub ?? "")}</text>`);
}

function linesKey(title, rows, accent = C.accent) {
  const rowSvg = rows
    .map((r, i) => {
      const y = 62 + i * 31;
      return `<text x="14" y="${y}" font-family="Segoe UI, sans-serif" font-size="${r.big ? 28 : 20}" font-weight="${r.big ? 700 : 600}" fill="${r.color ?? C.text}">${esc(r.text)}</text>`;
    })
    .join("");
  return svgWrap(`
    <rect x="0" y="0" width="144" height="34" rx="18" fill="${C.panel}"/>
    <rect x="0" y="17" width="144" height="17" fill="${C.panel}"/>
    <text x="14" y="24" font-family="Segoe UI, sans-serif" font-size="17" font-weight="600" letter-spacing="0.5" fill="${accent}">${esc(title)}</text>
    ${rowSvg}`);
}

function bigCountKey(title, count, sub, subColor, animPhase = null) {
  // animPhase non-null → cycling activity dots beside the count (frame-pushed animation)
  const dots = animPhase == null ? "" : [0, 1, 2]
    .map((i) => `<circle cx="122" cy="${56 + i * 16}" r="${i === animPhase ? 4.5 : 3}" fill="${i === animPhase ? C.ok : C.track}"/>`)
    .join("");
  return svgWrap(`
    <text x="14" y="27" font-family="Segoe UI, sans-serif" font-size="17" font-weight="600" letter-spacing="0.5" fill="${C.dim}">${esc(title)}</text>
    ${dots}
    <text x="72" y="96" text-anchor="middle" font-family="Segoe UI, sans-serif" font-size="64" font-weight="700" fill="${count > 0 ? C.text : C.dim}">${count}</text>
    <text x="72" y="128" text-anchor="middle" font-family="Segoe UI, sans-serif" font-size="17" fill="${subColor ?? C.dim}">${esc(sub ?? "")}</text>`);
}

function burnKey(tokensHour, sub) {
  const has = tokensHour != null;
  return svgWrap(`
    <text x="14" y="27" font-family="Segoe UI, sans-serif" font-size="17" font-weight="600" letter-spacing="0.5" fill="${C.dim}">BURN RATE</text>
    <text x="72" y="82" text-anchor="middle" font-family="Segoe UI, sans-serif" font-size="40" font-weight="700" fill="${has ? C.accent : C.dim}">${has ? fmtNum(tokensHour) : "--"}</text>
    <text x="72" y="104" text-anchor="middle" font-family="Segoe UI, sans-serif" font-size="16" fill="${C.dim}">tok/hr</text>
    <text x="72" y="128" text-anchor="middle" font-family="Segoe UI, sans-serif" font-size="15" fill="${C.dim}">${esc(sub ?? "")}</text>`);
}

// Generic key for configurable actions: header + big wrapped label + footer
function labelKey(title, label, sub, accent = C.accent) {
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
    .map((l, i) => `<text x="72" y="${lines.length > 1 ? 68 + i * 27 : 82}" text-anchor="middle" font-family="Segoe UI, sans-serif" font-size="22" font-weight="700" fill="${C.text}">${esc(l.slice(0, 12))}</text>`)
    .join("");
  return svgWrap(`
    <text x="14" y="27" font-family="Segoe UI, sans-serif" font-size="17" font-weight="600" letter-spacing="0.5" fill="${accent}">${esc(title)}</text>
    ${lineSvg}
    <text x="72" y="128" text-anchor="middle" font-family="Segoe UI, sans-serif" font-size="15" fill="${C.dim}">${esc(sub ?? "")}</text>`);
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
  usage: null,        // { fiveHour, weekly, weeklyOpus } each { pct, resetsAt }
  usageErr: null,
  usageAt: 0,
  sessions: [],
  today: null,
  burn: null,
  pctHistory: [],
  loggedRaw: false,
};

async function readToken() {
  const raw = await fsp.readFile(CREDS_FILE, "utf8");
  const creds = JSON.parse(raw);
  return creds?.claudeAiOauth?.accessToken ?? null;
}

function pickBucket(o) {
  if (!o || typeof o !== "object") return null;
  let pct = null;
  if (typeof o.utilization === "number") pct = o.utilization <= 1 && o.utilization > 0 ? o.utilization * 100 : o.utilization;
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
    const token = await readToken();
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
    const changed = JSON.stringify(out.map((s) => [s.pid, s.status])) !== JSON.stringify(state.sessions.map((s) => [s.pid, s.status]));
    state.sessions = out;
    if (changed) renderAll(["sessions", "focus-session"]);
  } catch (e) {
    log("sessions poll failed:", String(e));
  }
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
    const dirs = await fsp.readdir(PROJECTS_DIR).catch(() => []);
    for (const d of dirs) {
      const dir = path.join(PROJECTS_DIR, d);
      let files;
      try { files = await fsp.readdir(dir); } catch { continue; }
      for (const f of files) {
        if (!f.endsWith(".jsonl")) continue;
        const fp = path.join(dir, f);
        let st;
        try { st = await fsp.stat(fp); } catch { continue; }
        if (st.mtimeMs < dayStart.getTime()) continue; // untouched today
        chats.add(fp);
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
    const dirs = await fsp.readdir(PROJECTS_DIR).catch(() => []);
    for (const d of dirs) {
      const dir = path.join(PROJECTS_DIR, d);
      let files;
      try { files = await fsp.readdir(dir); } catch { continue; }
      for (const f of files) {
        if (!f.endsWith(".jsonl")) continue;
        const fp = path.join(dir, f);
        let st;
        try { st = await fsp.stat(fp); } catch { continue; }
        if (st.mtimeMs < scanCutoff) continue;
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
    }
    let tokensHour = 0;
    for (const rec of hourTracker.values()) for (const e of rec.events) if (now - e.t < 3.6e6) tokensHour += e.tok;
    state.burn = { tokensHour, at: now };
    renderAll(["burn-rate"]);
  } catch (e) {
    log("burn poll failed:", String(e));
  }
}

// Projects time-to-cap from the trend of 5h utilization samples
function sessionEta() {
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
const focusIdx = new Map(); // context -> session index
let ws = null;
let animPhase = 0;

function send(obj) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
}
const setImage = (context, image) => send({ event: "setImage", context, payload: { image, target: 0 } });
const setTitle = (context) => send({ event: "setTitle", context, payload: { title: "", target: 0 } });
const showOk = (context) => send({ event: "showOk", context });
const showAlert = (context) => send({ event: "showAlert", context });

const kindOf = (action) => action.replace("com.technicallybrantley.claude-deck.", "");

function render(context, kind) {
  switch (kind) {
    case "usage-session": {
      if (state.usageErr && !state.usage) return setImage(context, gaugeKey("SESSION 5H", null, state.usageErr.includes("429") ? "throttled" : "sign in?"));
      const b = state.usage?.fiveHour;
      return setImage(context, gaugeKey("SESSION 5H", b?.pct ?? null, b ? fmtReset(b.resetsAt) : "no data", b?.pct >= 90 ? animPhase : null));
    }
    case "usage-weekly": {
      if (state.usageErr && !state.usage) return setImage(context, gaugeKey("WEEKLY", null, state.usageErr.includes("429") ? "throttled" : "sign in?"));
      const b = state.usage?.weekly;
      const u = state.usage;
      const sub = u?.scopedPct != null && u.scopedName
        ? `${u.scopedName} ${Math.round(u.scopedPct)}%`
        : u?.weeklyOpus?.pct != null ? `opus ${Math.round(u.weeklyOpus.pct)}%`
        : b ? fmtReset(b.resetsAt) : "no data";
      return setImage(context, gaugeKey("WEEKLY", b?.pct ?? null, sub, b?.pct >= 90 ? animPhase : null));
    }
    case "usage-model": {
      const models = state.usage?.models ?? [];
      const want = views.get(context)?.settings?.model;
      const m = models.find((x) => x.name === want) ?? models[0];
      const name = (m?.name ?? want ?? "MODEL").toUpperCase().slice(0, 8);
      return setImage(context, gaugeKey(`${name} 7D`, m?.pct ?? null, m?.resetsAt ? fmtReset(m.resetsAt) : "no data", m?.pct >= 90 ? animPhase : null));
    }
    case "burn-rate":
      return setImage(context, burnKey(state.burn?.tokensHour ?? null, sessionEta()));
    case "project": {
      const s = views.get(context)?.settings ?? {};
      const label = s.label || (s.path ? path.basename(s.path) : "");
      return setImage(context, labelKey("PROJECT", label || "configure", s.path ? "" : "set folder in settings"));
    }
    case "focus-session": {
      const i = focusIdx.get(context);
      const s = i != null && state.sessions.length ? state.sessions[i % state.sessions.length] : null;
      return setImage(context, labelKey("FOCUS", s ? s.name : `${state.sessions.length} sessions`, s ? s.status : "press to cycle", C.ok));
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
        const status = s.status ?? "?";
        return setImage(context, linesKey(`${cy.idx + 1}/${n}`, [
          { text: (s.name ?? "session").slice(0, 11), big: false, color: C.text },
          { text: status, color: status === "idle" ? C.dim : C.ok },
          { text: fmtAgo(s.startedAt ?? Date.now()) + " old", color: C.dim },
        ]));
      }
      const busy = state.sessions.filter((s) => s.status && s.status !== "idle").length;
      return setImage(context, bigCountKey("CLAUDE CODE", n, busy > 0 ? `${busy} working` : n > 0 ? "all idle" : "none running", busy > 0 ? C.ok : C.dim, busy > 0 ? animPhase : null));
    }
    case "today": {
      const t = state.today;
      return setImage(context, linesKey("TODAY", [
        { text: `${t?.chats ?? "--"} chats`, color: C.text },
        { text: `${fmtNum(t?.msgs)} msgs`, color: C.text },
        { text: `${fmtNum(t?.tokens)} tok`, color: C.accent },
      ]));
    }
  }
}

function renderAll(kinds) {
  for (const [context, v] of views) if (kinds.includes(v.kind)) render(context, v.kind);
}

// ---------- platform adapter ----------
const OSA_TIMEOUT_MS = 8000;

// Resolve on successful spawn, reject if the process can't be launched.
// Matches the old optimistic "showOk right after spawn" behavior, but now
// surfaces spawn failures as a single showAlert (see spec §5.8).
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
  focusWindow(s) {
    const target = escapeAppleScript(focusTarget(s));
    if (!target) return Promise.reject(new Error("no focus target"));
    return runOsa([
      "with timeout of 7 seconds",
      'tell application "Terminal"',
      `  set t to "${target}"`,
      "  repeat with w in windows",
      "    if (name of w as string) contains t then",
      "      set index of w to 1",
      "      activate",
      "      return",
      "    end if",
      "  end repeat",
      "end tell",
      'error "not found"',
      "end timeout",
    ]);
  },
};

const platform = IS_MAC ? macPlatform : winPlatform;

// Uniform Stream Deck feedback: OK on resolve, Alert on reject.
function act(context, p) {
  p.then(() => showOk(context)).catch(() => showAlert(context));
}

// ---------- key actions ----------
function onKeyDown(context, kind) {
  switch (kind) {
    case "usage-session":
    case "usage-weekly":
      if (Date.now() - lastUsageAttempt > 30_000) pollUsage();
      return showOk(context);
    case "today":
      pollToday();
      return showOk(context);
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
    case "usage-model":
      if (Date.now() - lastUsageAttempt > 30_000) pollUsage();
      return showOk(context);
    case "burn-rate":
      pollBurn();
      return showOk(context);
    case "project": {
      const s = views.get(context)?.settings ?? {};
      if (!s.path) return showAlert(context);
      return act(context, platform.openTerminal(s.path));
    }
    case "focus-session": {
      const n = state.sessions.length;
      if (!n) return showAlert(context);
      const i = ((focusIdx.get(context) ?? -1) + 1) % n;
      focusIdx.set(context, i);
      act(context, platform.focusWindow(state.sessions[i]));
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
    await pollToday();
    log("selftest today:", JSON.stringify(state.today));
    await pollBurn();
    log("selftest burn:", JSON.stringify(state.burn), "eta:", sessionEta());
    process.exit(0);
  })();
} else {
  const port = argOf("-port");
  const pluginUUID = argOf("-pluginUUID");
  const registerEvent = argOf("-registerEvent");
  log(`starting: port=${port} uuid=${pluginUUID}`);

  ws = new WebSocket(`ws://127.0.0.1:${port}`);
  ws.on("open", () => {
    send({ event: registerEvent, uuid: pluginUUID });
    log("registered with Stream Deck");
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
      views.set(context, { kind: kindOf(action), settings: msg.payload?.settings ?? {} });
      setTitle(context);
      render(context, kindOf(action));
    } else if (event === "willDisappear") {
      views.delete(context);
      cycle.delete(context);
      focusIdx.delete(context);
    } else if (event === "didReceiveSettings" && action) {
      const v = views.get(context);
      if (v) { v.settings = msg.payload?.settings ?? {}; render(context, v.kind); }
    } else if (event === "sendToPlugin" && action) {
      if (msg.payload?.cmd === "getModels") {
        send({ event: "sendToPropertyInspector", context, payload: { models: (state.usage?.models ?? []).map((m) => m.name) } });
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
  // Animation ticker: busy-session dots + red pulse on gauges at 90%+
  setInterval(() => {
    animPhase = (animPhase + 1) % 3;
    const kinds = [];
    if (state.sessions.some((s) => s.status && s.status !== "idle")) kinds.push("sessions");
    if (state.usage?.fiveHour?.pct >= 90) kinds.push("usage-session");
    if (state.usage?.weekly?.pct >= 90) kinds.push("usage-weekly");
    if ((state.usage?.models ?? []).some((m) => m.pct >= 90)) kinds.push("usage-model");
    if (kinds.length && [...views.values()].some((v) => kinds.includes(v.kind))) renderAll(kinds);
    // Safety net: a reset time has passed but we still show pre-reset data (missed timer / resume from sleep)
    const expired = [state.usage?.fiveHour, state.usage?.weekly]
      .some((b) => b?.resetsAt && Date.now() - new Date(b.resetsAt).getTime() > 5000);
    if (expired && !state.usageErr && Date.now() - lastUsageAttempt > 30_000) pollUsage();
  }, 600);
  // Keep countdowns ("1h 5m left") fresh between polls
  setInterval(() => renderAll(["usage-session", "usage-weekly", "usage-model", "burn-rate"]), 30_000);
}
