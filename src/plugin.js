// Agent Vitals — Stream Deck plugin
// Shows live Claude subscription usage (same numbers as Claude Desktop / /usage),
// running Claude Code sessions, and quick-launch keys.
import { WebSocket } from "ws";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn, execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { escapeAppleScript, parseHotkey, hotkeyClause, classifyCustomCommand, parseKeychainToken, parsePsTree, hostAppForPid, focusStrategyForBundle, terminalFocusScript, parseProcStarts } from "./osa.js";
import { windowStartMs, parseRequests, mergeById, aggregate, aggregateByModel, budgetPct, localDay, newDayCounts, foldDayChunk, dayCountsTotals } from "./usage.js";
import { resolveStatusKey, statusEntry, autoSlot, sessionState, blockedSessions, sessionSig, transcriptPathFor, pidLooksRecycled } from "./status.js";
import { randomBytes } from "node:crypto";
import {
  decisionBody, alwaysRule, pressDecision,
  enqueue, approvable, approvableDepth, pendingBySession, resolve, expiredIds, staleIds, seedBaselines, hookFragment,
  rememberDeny, denyBlock, pruneDenies,
  PORT_DEFAULT, HOLD_S_DEFAULT, QUEUE_MAX,
} from "./approve.js";
import { startHookServer, BADPATH_WINDOW_MS, BADPATH_MIN_HITS } from "./hookserver.js";
import {
  viewFor, gaugeMode, GAUGE_WINDOW, modelList, modelListIndex, sessionEta, PULSE_MS,
} from "./view.js";

const IS_MAC = process.platform === "darwin";

const PLUGIN_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const CLAUDE_DIR = path.join(os.homedir(), ".claude");
const CREDS_FILE = path.join(CLAUDE_DIR, ".credentials.json");
const SESSIONS_DIR = path.join(CLAUDE_DIR, "sessions");
const PROJECTS_DIR = path.join(CLAUDE_DIR, "projects");
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
// Size-capped with one generation kept, so the log can never grow without bound:
// Stream Deck keeps this process alive for weeks, and README tells users to open
// and share this file. Disk is bounded at 2 * LOG_MAX_BYTES.
//
// The running total is tracked in memory rather than stat'ing on every call —
// every poll failure and every approve decision logs, and this is a sync write on
// the same thread that renders keys. Seeded from the file already on disk so a
// restart does not reset the budget and let the old file grow past the cap.
const LOG_FILE = path.join(process.cwd(), "agent-vitals.log");
const LOG_OLD_FILE = LOG_FILE + ".old";
const LOG_MAX_BYTES = 1_000_000;
let logBytes = 0;
try { logBytes = fs.statSync(LOG_FILE).size; } catch {}

function log(...args) {
  const line = `${new Date().toISOString()} ${args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ")}`;
  console.log(line);
  const bytes = Buffer.byteLength(line) + 1; // byteLength, not length: paths and session names are not all ASCII
  try {
    if (logBytes + bytes > LOG_MAX_BYTES) {
      // rename replaces any existing .old, so exactly one generation survives.
      // Guarded separately: a missing LOG_FILE must not cost us the append below.
      try { fs.renameSync(LOG_FILE, LOG_OLD_FILE); } catch {}
      logBytes = 0;
    }
    fs.appendFileSync(LOG_FILE, line + "\n");
    logBytes += bytes;
  } catch {}
}


// ---------- data: usage (OAuth endpoint — same source as /usage & Claude Desktop) ----------
const state = {
  activity: new Map(), // sessionId -> transcript mtimeMs (status-less sessions only)
  usage: null,        // { fiveHour, weekly, weeklyOpus } each { pct, resetsAt }
  usageErr: null,
  usageMeter: null,   // { [window]: {tokens, cost, in, out} } from pollUsageMeter
  usageMeterModels: null, // [{model,tokens,cost}] over 7d, for the model key in local mode
  usageAt: 0,
  sessions: [],
  today: null,
  burn: null,
  pctHistory: [],
  loggedRaw: false,
  rates: {},
  approveQueue: [],
  // Derived from approveQueue on every mutation (queueChanged): sessionId ->
  // {kind, reason, since}. The Status/WAITING keys read it, because for a VS Code
  // session it is the ONLY evidence that the session is blocked on the human.
  pending: new Map(),
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

// Verdicts for the recycled-pid check, keyed by pid AND startedAt so the same pid
// reused by a genuinely new session is re-verified rather than inheriting the old
// answer. Pruned every tick against the live set — this map must not become the
// third unbounded cache.
const pidVerdict = new Map(); // "pid:startedAt" -> true (genuine) | false (recycled)
const verdictKey = (s) => `${s.pid}:${s.startedAt ?? 0}`;

// Drop sessions whose file outlived its process and whose pid now belongs to
// something else (see pidLooksRecycled). The process listing costs one subprocess,
// so it runs only when an unverified session appears — sessions are long-lived, so
// in practice that is once per session, not once per 5s tick.
async function dropRecycledPids(sessions) {
  const unknown = sessions.filter((s) => !pidVerdict.has(verdictKey(s)));
  if (unknown.length) {
    let starts = null;
    try {
      starts = parseProcStarts(await platform.listProcStarts(), Date.now());
    } catch (e) {
      // Fail open, and deliberately do NOT cache a verdict: a transient failure
      // must not permanently mark an unverified session as genuine.
      log("sessions: process-start listing failed, keeping all sessions:", String(e?.message ?? e));
    }
    if (starts) {
      for (const s of unknown) {
        const recycled = pidLooksRecycled(s, starts.get(s.pid) ?? null);
        pidVerdict.set(verdictKey(s), !recycled);
        if (recycled) {
          log(`sessions: ignoring ${path.basename(s.cwd ?? "")} — pid ${s.pid} belongs to a process younger than the session (stale session file)`);
        }
      }
    }
  }
  const live = new Set(sessions.map(verdictKey));
  for (const k of pidVerdict.keys()) if (!live.has(k)) pidVerdict.delete(k);
  return sessions.filter((s) => pidVerdict.get(verdictKey(s)) !== false);
}

async function pollSessions() {
  try {
    const files = await fsp.readdir(SESSIONS_DIR).catch(() => []);
    let out = [];
    for (const f of files) {
      if (!f.endsWith(".json")) continue;
      try {
        const s = JSON.parse(await fsp.readFile(path.join(SESSIONS_DIR, f), "utf8"));
        if (s.pid && pidAlive(s.pid)) out.push(s);
      } catch {}
    }
    // Before anything derives from this list — including the approver's staleness
    // baselines below — discard sessions whose pid was recycled after a crash.
    out = await dropRecycledPids(out);
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
    const nextSig = sessionSig(out, Date.now(), state.activity, state.pending);
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

// Every QUEUE MUTATION goes through here, never bare renderApproveAll(): state.pending is
// derived from the queue and the Status/WAITING keys read it, so they have to repaint with
// the approve keys or they would keep reporting "all clear" through a whole hold window.
// (renderApproveAll alone is still correct for changes that leave the queue alone — a
// hookErr clearing, a deny block expiring.)
function queueChanged() {
  state.pending = pendingBySession(state.approveQueue);
  renderAll([...APPROVE_KINDS, "approver-status", "approver-waiting"]);
}

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

// Tracks the request the keys PAINT (approvable, not the raw head), so a question
// arriving or leaving cannot re-arm the settle window on a triad whose face never
// changed — and so a genuine change to that face always does.
function noteHeadChange(prevId) {
  const now = approvable(state.approveQueue)?.id ?? null;
  if (now !== prevId) state.lastHeadChangeAt = Date.now();
}

// Answering {} frees the socket at once. Safety does not depend on it (the terminal
// prompt is live and answerable throughout) but the queue's honesty does.
function answerAndDrop(ids, why) {
  if (!ids.length) return;
  const prev = approvable(state.approveQueue)?.id ?? null;
  for (const id of ids) {
    const { queue, req } = resolve(state.approveQueue, id);
    state.approveQueue = queue;
    if (req) {
      req.ticket.respond(null);
      log(`approve: dropped ${req.toolName} (${why})`);
    }
  }
  noteHeadChange(prev);
  queueChanged();
}

function onHookRequest(payload, ticket) {
  // Metadata only. tool_input for a Write is an entire file, and agent-vitals.log
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
  const prev = approvable(state.approveQueue)?.id ?? null;
  const { queue, evicted } = enqueue(state.approveQueue, req);
  state.approveQueue = queue;
  if (evicted) { evicted.ticket.respond(null); log(`approve: evicted ${evicted.toolName} (queue full at ${QUEUE_MAX})`); }
  noteHeadChange(prev);
  queueChanged();
}

const onHookDrop = (ticket) => {
  if (ticket.id == null) return;
  const prev = approvable(state.approveQueue)?.id ?? null;
  const { queue, req } = resolve(state.approveQueue, ticket.id);
  if (!req) return;
  state.approveQueue = queue;
  log(`approve: socket closed for ${req.toolName}`);
  // Must arm the settle window like answerAndDrop does, or a drop that promotes a new
  // head lets a double-tap answer a request the user never read.
  noteHeadChange(prev);
  queueChanged();
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

// One directory walk shared by every consumer that asks for an overlapping window.
//
// pollBurn, pollUsageMeter and pollToday each used to walk ~/.claude/projects and
// stat every .jsonl independently — pollBurn and pollUsageMeter both on a 60s
// timer, so on a machine with many projects that was two full traversals a minute
// doing identical work, plus a third every 5 minutes and one more on every Usage
// key press.
//
// The TTL is deliberately short. It exists to collapse callers that fire at
// essentially the same moment (the two 60s timers are started together and stay in
// step), NOT to serve stale data: pollBurn decides how many bytes to tail from
// each file's size, so a stale size just defers those lines to its next tick.
const SCAN_TTL_MS = 5_000;
let transcriptScan = { at: 0, cutoff: Infinity, files: [] };

async function scanTranscripts(cutoffMs) {
  const now = Date.now();
  const fresh = now - transcriptScan.at < SCAN_TTL_MS;
  // A cached scan is usable only if it reaches at least as far back as this
  // caller needs; the caller then narrows it to its own window.
  if (fresh && transcriptScan.cutoff <= cutoffMs) {
    return transcriptScan.files.filter((f) => f.mtimeMs >= cutoffMs);
  }
  // Widen to the union while the cache is fresh, so a month-window Usage key and
  // the 90-minute burn scan take turns paying for one traversal instead of
  // invalidating each other's.
  const cutoff = fresh ? Math.min(transcriptScan.cutoff, cutoffMs) : cutoffMs;
  const files = await walkTranscripts(PROJECTS_DIR, cutoff);
  transcriptScan = { at: now, cutoff, files };
  return files.filter((f) => f.mtimeMs >= cutoffMs);
}

// ---------- data: today's activity (incremental tail of today's transcripts) ----------
// Tails each file from a saved offset, the same shape pollBurn uses. The previous
// version re-read every transcript touched today IN FULL whenever its size changed
// — for an active session that is the whole file, every 5 minutes, and transcripts
// reach tens of MB. The dedup state that makes a partial read correct (one count
// per request id, max usage across snapshots) lives in the accumulator, so it
// survives between chunks; see newDayCounts/foldDayChunk in usage.js.
const todayTracker = new Map(); // path -> { offset, rest, counts }

async function pollToday() {
  try {
    const day = localDay(Date.now());
    const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
    let msgs = 0, tokens = 0;
    const chats = new Set();
    const files = await scanTranscripts(dayStart.getTime());
    const seen = new Set();
    for (const st of files) {
      const fp = st.path;
      seen.add(fp);
      if (!fp.split(path.sep).includes("subagents")) chats.add(fp); // conversations only (cross-platform)
      let rec = todayTracker.get(fp);
      // Restart from scratch on a new local day (the counts are day-scoped) or if
      // the file shrank, which means it was rewritten and our offset is meaningless.
      if (!rec || rec.counts.day !== day || st.size < rec.offset) {
        rec = { offset: 0, rest: "", counts: newDayCounts(day) };
      }
      if (st.size > rec.offset) {
        try {
          const fh = await fsp.open(fp, "r");
          try {
            const len = st.size - rec.offset;
            const buf = Buffer.alloc(len);
            // Trust bytesRead, not st.size: the shared scan's stat can be a few
            // seconds old, so a file rewritten in between would leave the tail of
            // `buf` as NUL padding and feed it to the parser.
            const { bytesRead } = await fh.read(buf, 0, len, rec.offset);
            rec.offset += bytesRead;
            // A read can land mid-line; hold the remainder for the next chunk so
            // foldDayChunk only ever sees whole lines.
            const chunk = rec.rest + buf.subarray(0, bytesRead).toString("utf8");
            const cut = chunk.lastIndexOf("\n");
            rec.rest = cut < 0 ? chunk : chunk.slice(cut + 1);
            foldDayChunk(rec.counts, cut < 0 ? "" : chunk.slice(0, cut));
          } finally { await fh.close(); }
        } catch { continue; }
      }
      todayTracker.set(fp, rec);
      const t = dayCountsTotals(rec.counts);
      msgs += t.msgs; tokens += t.tokens;
    }
    // Drop entries for files that left the scan (not touched today). Without this
    // the map only ever grows: the plugin runs for weeks, and at every local
    // midnight the whole previous day's file set becomes unreachable but stays
    // resident. A file outside today's scan contributes nothing to today's totals,
    // so forgetting it cannot change the numbers.
    for (const fp of todayTracker.keys()) if (!seen.has(fp)) todayTracker.delete(fp);
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
    const files = await scanTranscripts(scanCutoff);
    const seen = new Set();
    for (const st of files) {
      const fp = st.path;
        seen.add(fp);
        let rec = hourTracker.get(fp);
        if (!rec || st.size < rec.offset || !rec.seen) rec = { offset: 0, rest: "", events: [], seen: new Map() };
        if (st.size > rec.offset) {
          const fh = await fsp.open(fp, "r");
          try {
            const len = st.size - rec.offset;
            const buf = Buffer.alloc(len);
            // See pollToday: bytesRead, not st.size, or NUL padding reaches the parser.
            const { bytesRead } = await fh.read(buf, 0, len, rec.offset);
            rec.offset += bytesRead;
            const lines = (rec.rest + buf.subarray(0, bytesRead).toString("utf8")).split("\n");
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
    // Same leak as fileCache: every project ever touched kept a record (with its
    // own `seen` Map) for the life of the process. A file that fell out of the
    // 90-minute scan has no line newer than that, so its newest event is already
    // outside the 65-minute window below and its contribution to tokensHour is
    // zero — dropping it is exact, not approximate. If work resumes in that
    // project the record is rebuilt from offset 0 on the next tick.
    for (const fp of hourTracker.keys()) if (!seen.has(fp)) hourTracker.delete(fp);
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
    else if (GAUGE_WINDOW[v.kind] && gaugeMode(state, v.kind, Date.now()) === "local") wins.add(GAUGE_WINDOW[v.kind]);
    // Burn Rate's ETA falls back to local 5h spend, so it needs that window too.
    else if (v.kind === "burn-rate" && gaugeMode(state, "usage-session", Date.now()) === "local") wins.add("5h");
  }
  if (!wins.size) return; // gated: no Usage keys visible
  const now = Date.now();
  const cutoff = Math.min(...[...wins].map((w) => windowStartMs(w, now)));
  try {
    const files = await scanTranscripts(cutoff);
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

const kindOf = (action) => action.replace("dev.tapparello.agent-vitals.", "");

// Adapter: resolve this key's per-context UI state, ask view.js what to draw, then
// perform the two side effects it deliberately does not — pushing the image, and
// recording what the approve keys painted for the press guard to check.
function render(context, kind) {
  const v = views.get(context);
  const cy = cycle.get(context);
  const { image, painted } = viewFor(kind, {
    state,
    settings: v?.settings ?? {},
    now: Date.now(),
    animPhase,
    usageViewMode: usageView.get(context) ?? "cost",
    pressedModelIdx: modelIdx.get(context) ?? null,
    cycleIdx: cy && cy.idx >= 0 ? cy.idx : -1,
    focus: focusIdx.get(context) ?? null,
    autoSlot: kind === "approver-status" ? autoSlotFor(context) : 0,
    authFlagged: authFlagged(),
    defaultCodeDir: DEFAULT_CODE_DIR,
  });
  if (painted) {
    shownReq.set(context, painted.reqId);
    shownRule.set(context, painted.rule);
  }
  if (image != null) setImage(context, image);
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

  // "<pid> <elapsed-seconds>" per line, for the recycled-pid check. Shaped to
  // match macOS `ps -axo pid=,etimes=` so one parser serves both platforms.
  // StartTime throws on some protected system processes — skip those rather than
  // failing the whole listing, since a pid we cannot read is simply left
  // unverified (and therefore kept).
  listProcStarts() {
    const ps = "Get-Process | ForEach-Object { try { \"$($_.Id) $([int]((Get-Date) - $_.StartTime).TotalSeconds)\" } catch {} }";
    return new Promise((resolve, reject) => {
      execFile("powershell.exe", ["-NoProfile", "-Command", ps], { timeout: OSA_TIMEOUT_MS, maxBuffer: 4 << 20 },
        (err, out) => (err ? reject(err) : resolve(String(out))));
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

  // "<pid> <elapsed>" per line, for the recycled-pid check. `etime`, not `etimes`:
  // the seconds-valued `etimes` keyword is a GNU procps extension and BSD ps exits
  // with "keyword not found" (measured). parseElapsed handles etime's
  // "[[dd-]hh:]mm:ss" shape, which is numeric and so locale-independent.
  listProcStarts() {
    return new Promise((resolve, reject) => {
      execFile("ps", ["-axo", "pid=,etime="], { timeout: OSA_TIMEOUT_MS, maxBuffer: 4 << 20 },
        (err, out) => (err ? reject(err) : resolve(String(out))));
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
      if (gaugeMode(state, kind, Date.now()) === "local") {
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
      const mode = gaugeMode(state, "usage-model", Date.now());
      const list = modelList(state, mode);
      if (list.length > 1) {
        const cur = modelListIndex(modelIdx.get(context) ?? null, list, views.get(context)?.settings?.model);
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
      const blocked = blockedSessions(state.sessions, Date.now(), state.activity, state.pending);
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
      const resolved = resolveStatusKey(state.sessions, s.project ?? "", autoSlotFor(context), Date.now(), state.activity, state.pending);
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
      const blocked = blockedSessions(state.sessions, Date.now(), state.activity, state.pending);
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
        const target = approvable(state.approveQueue);
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
        queueChanged();
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
    log("selftest burn:", JSON.stringify(state.burn), "eta:", sessionEta(state, Date.now()));
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
    if (state.sessions.some((s) => sessionState(s, Date.now(), state.activity.get(s.sessionId) ?? null, state.pending.get(s.sessionId)?.kind ?? null) === "working")) kinds.push("sessions");
    if (state.usage?.fiveHour?.pct >= 90) kinds.push("usage-session");
    if (state.usage?.weekly?.pct >= 90) kinds.push("usage-weekly");
    if ((state.usage?.models ?? []).some((m) => m.pct >= 90)) kinds.push("usage-model");
    // Local/budget rings live outside state.usage, so gate them separately or a
    // ring at 98% would sit perfectly still while README promises a pulse.
    for (const [k, win] of Object.entries(GAUGE_WINDOW)) {
      if (gaugeMode(state, k, Date.now()) !== "local") continue;
      const agg = k === "usage-model" ? (state.usageMeterModels ?? [])[0] : state.usageMeter?.[win];
      const bud = [...views.values()].find((v) => v.kind === k)?.settings?.budget;
      if (agg && (budgetPct(agg.cost, bud) ?? 0) >= 90) kinds.push(k);
    }
    // A session blocked on you makes its keys breathe — far easier to catch than
    // a static colour. Gated on there actually being one, so a calm deck is idle.
    // A VS Code session has no statusUpdatedAt, so `!b.statusUpdatedAt` alone would hold
    // this true forever and breathe until morning — the very thing PULSE_MS exists to
    // stop. The held request's arrival time is the honest start of that wait.
    const freshBlocked = blockedSessions(state.sessions, Date.now(), state.activity, state.pending)
      .some((b) => {
        const since = b.statusUpdatedAt ?? state.pending.get(b.sessionId)?.since ?? null;
        return !since || Date.now() - since < PULSE_MS;
      });
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
      // approvableDepth, not length: a queue holding only questions paints "all clear" on
      // the triad, and there is no breath to keep smooth.
      if (approvableDepth(state.approveQueue)) kinds.push(...APPROVE_KINDS);
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
