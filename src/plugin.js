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
execFile("powershell.exe", ["-NoProfile", "-Command",
  "Get-StartApps | Where-Object {$_.Name -eq 'Claude'} | Select-Object -First 1 -ExpandProperty AppID"],
  (err, out) => { const id = out?.trim(); if (!err && id) desktopAppId = "shell:AppsFolder\\" + id; });

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

function gaugeKey(label, pct, sub) {
  const has = typeof pct === "number" && isFinite(pct);
  const p = has ? Math.max(0, Math.min(100, pct)) : 0;
  const col = has ? pctColor(p) : C.dim;
  return svgWrap(`
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

function bigCountKey(title, count, sub, subColor) {
  return svgWrap(`
    <text x="14" y="27" font-family="Segoe UI, sans-serif" font-size="17" font-weight="600" letter-spacing="0.5" fill="${C.dim}">${esc(title)}</text>
    <text x="72" y="96" text-anchor="middle" font-family="Segoe UI, sans-serif" font-size="64" font-weight="700" fill="${count > 0 ? C.text : C.dim}">${count}</text>
    <text x="72" y="128" text-anchor="middle" font-family="Segoe UI, sans-serif" font-size="17" fill="${subColor ?? C.dim}">${esc(sub ?? "")}</text>`);
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
    state.usage = {
      fiveHour: pickBucket(j.five_hour) ?? fromLimit("session"),
      weekly: pickBucket(j.seven_day) ?? fromLimit("weekly_all"),
      weeklyOpus: pickBucket(j.seven_day_opus),
      scopedPct: scoped?.percent ?? null,
      scopedName: scoped?.scope?.model?.display_name ?? null,
    };
    state.usageErr = null;
    state.usageAt = Date.now();
    try { fs.writeFileSync(CACHE_FILE, JSON.stringify({ usage: state.usage, at: state.usageAt })); } catch {}
  } catch (e) {
    state.usageErr = String(e.message ?? e);
    log("usage poll failed:", state.usageErr);
  }
  renderAll(["usage-session", "usage-weekly"]);
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
    if (changed) renderAll(["sessions"]);
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
          for (const line of text.split("\n")) {
            if (!line) continue;
            let j;
            try { j = JSON.parse(line); } catch { continue; }
            if (!j.timestamp || localDay(j.timestamp) !== day) continue;
            if (j.type === "user" || j.type === "assistant") fMsgs++;
            const u = j.message?.usage;
            if (u) fTokens += (u.input_tokens ?? 0) + (u.output_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
          }
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

// ---------- websocket / stream deck plumbing ----------
function argOf(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const views = new Map(); // context -> { kind }
const cycle = new Map(); // context -> { idx, timer }
let ws = null;

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
      return setImage(context, gaugeKey("SESSION 5H", b?.pct ?? null, b ? fmtReset(b.resetsAt) : "no data"));
    }
    case "usage-weekly": {
      if (state.usageErr && !state.usage) return setImage(context, gaugeKey("WEEKLY", null, state.usageErr.includes("429") ? "throttled" : "sign in?"));
      const b = state.usage?.weekly;
      const u = state.usage;
      const sub = u?.scopedPct != null && u.scopedName
        ? `${u.scopedName} ${Math.round(u.scopedPct)}%`
        : u?.weeklyOpus?.pct != null ? `opus ${Math.round(u.weeklyOpus.pct)}%`
        : b ? fmtReset(b.resetsAt) : "no data";
      return setImage(context, gaugeKey("WEEKLY", b?.pct ?? null, sub));
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
      return setImage(context, bigCountKey("CLAUDE CODE", n, busy > 0 ? `${busy} working` : n > 0 ? "all idle" : "none running", busy > 0 ? C.ok : C.dim));
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

// ---------- key actions ----------
function launchDesktop(context) {
  const child = spawn("explorer.exe", [desktopAppId], { detached: true, stdio: "ignore" });
  child.on("error", () => showAlert(context));
  child.unref();
  showOk(context);
}

function quickChat(context) {
  // Global quick-chat hotkey Ctrl+Alt+Space via keybd_event (SendKeys can't do Space chords reliably)
  const ps = `
Add-Type -Namespace K -Name W -MemberDefinition '[DllImport("user32.dll")] public static extern void keybd_event(byte k, byte s, uint f, UIntPtr e);';
[K.W]::keybd_event(0x11,0,0,[UIntPtr]::Zero); [K.W]::keybd_event(0x12,0,0,[UIntPtr]::Zero); [K.W]::keybd_event(0x20,0,0,[UIntPtr]::Zero);
Start-Sleep -Milliseconds 60;
[K.W]::keybd_event(0x20,0,2,[UIntPtr]::Zero); [K.W]::keybd_event(0x12,0,2,[UIntPtr]::Zero); [K.W]::keybd_event(0x11,0,2,[UIntPtr]::Zero);`;
  const child = spawn("powershell.exe", ["-NoProfile", "-WindowStyle", "Hidden", "-Command", ps], { detached: true, stdio: "ignore" });
  child.on("error", () => showAlert(context));
  child.unref();
  showOk(context);
}

function openWeb(context) {
  const child = spawn("cmd.exe", ["/c", "start", "", "https://claude.ai/new"], { detached: true, stdio: "ignore" });
  child.on("error", () => showAlert(context));
  child.unref();
  showOk(context);
}

function openClaudeCode(context) {
  const dir = DEFAULT_CODE_DIR;
  const psFallback = () => {
    const fb = spawn("cmd.exe", ["/c", "start", "", "powershell", "-NoExit", "-Command", `cd '${dir}'; claude`], { detached: true, stdio: "ignore" });
    fb.on("error", () => showAlert(context));
    fb.unref();
  };
  // Windows Terminal is single-instance: without `-w new` it opens a hidden tab
  // in whatever window already exists, so force a fresh foreground window.
  const wt = spawn("cmd.exe", ["/c", "start", "", "wt", "-w", "new", "-d", dir, "powershell", "-NoExit", "-Command", "claude"], { detached: true, stdio: "ignore" });
  wt.on("error", psFallback);
  wt.on("exit", (code) => { if (code !== 0) psFallback(); });
  wt.unref();
  showOk(context);
}

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
    case "launch": return launchDesktop(context);
    case "quick-chat": return quickChat(context);
    case "open-web": return openWeb(context);
    case "claude-code": return openClaudeCode(context);
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
      views.set(context, { kind: kindOf(action) });
      setTitle(context);
      render(context, kindOf(action));
    } else if (event === "willDisappear") {
      views.delete(context);
      cycle.delete(context);
    } else if (event === "keyDown" && action) {
      onKeyDown(context, kindOf(action));
    }
  });

  (function usageLoop() { setTimeout(async () => { await pollUsage(); usageLoop(); }, usageDelay); })();
  setInterval(pollSessions, 5_000);
  setInterval(pollToday, 300_000);
}
