// Key art: the pure SVG renderers for every Stream Deck key (144x144).
// Extracted verbatim from src/plugin.js so the design system lives in one place
// and can be rendered outside the plugin (no WebSocket, no Stream Deck) for review.
// Everything here is a pure function of its arguments — no module state, no I/O.
// localGauge() deliberately stayed in plugin.js: it reads the animPhase ticker.
import { describeRequest, alwaysRule, RULE_MAX } from "./approve.js";

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

function fmtNum(n) {
  if (n == null) return "--";
  if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "k";
  return String(n);
}

export {
  C, pctColor, esc, tintFrame, svgWrap,
  gaugeKey, linesKey, bigCountKey, burnKey, usageMeterKey, labelKey,
  STATUS_LOOK, statusKey, APPROVE_LOOK, approveKey, fmtNum,
};
