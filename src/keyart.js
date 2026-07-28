// Key art: the pure SVG renderers for every Stream Deck key (144x144).
// Everything here is a pure function of its arguments — no module state, no I/O — so
// the whole deck can be rendered outside the plugin for review.
// localGauge() stays in plugin.js: it reads the animPhase ticker.
//
// THREE RULES, each from a measurement rather than taste:
//
//  1. COLOUR IS MEANING, NEVER DECORATION. Data renders in bone (C.text); colour is
//     reserved for state and for the three approve decisions. This is forced, not
//     chosen: five hues are already spoken for (ok/warn/bad/info/ask) and every
//     candidate for a sixth "data accent" landed within 1.00-1.19:1 of one of them,
//     worse under deuteranopia. The old Claude orange was itself in that band, which
//     is why a deck showing four dollar amounts read as an alarm.
//
//  2. A BAND MEANS THE PRESS LEAVES THE DECK. Actions with an external side effect
//     (launch an app, focus a window, answer a permission prompt) get a top band and
//     a glyph; keys that only cycle or refresh what they already display get neither.
//     The band is ACHROMATIC so action class and state tint never compete — colouring
//     it by state is what let a working FOCUS key impersonate the blue ALWAYS key
//     sitting next to it in the bundled profile.
//
//  3. ONE SKELETON on every key, both classes: header 0-34, value, sub at y=127.
import { describeRequest, alwaysRule } from "./approve.js";

const C = {
  bg: "#16151c",
  panel: "#211f2b",
  text: "#f5f1ea",
  dim: "#9b96a8",
  // Band rule for an action. Achromatic on purpose: zero hue is zero collision with
  // any state colour, in any vision type and in greyscale. 3.56:1 as a graphic mark
  // once composited, above the 3:1 non-text target. The old solid-orange launch key
  // WAS findable — it was just shouting; this keeps the findability.
  rail: "#807b8d",
  // Identity hues, one per action: WHICH key is this, never what is happening. Hue
  // alone could not carry identity — every candidate collided with a state colour —
  // but CHROMA can. These sit at chroma ~20 against a state palette whose lowest is
  // 49 (info blue), a 2.5x-4.6x separation, so vivid reads as signal and muted reads
  // as identity. All land at 8.4:1 on the background. They colour the BAND and GLYPH
  // only; the frame tint stays exclusively for state, so a working FOCUS key still
  // cannot be mistaken for the vivid-blue ALWAYS key beside it.
  ident: {
    code: "#96b99e", launch: "#cbab8f", chat: "#b8abce", web: "#cda5bd",
    focus: "#7fbbbf", project: "#bbb08c", prompt: "#d7a4a6", custom: "#94b4d4",
  },
  ok: "#4ade80",
  warn: "#fbbf24",
  bad: "#f87171",
  track: "#3a3745",
  info: "#60a5fa", // status: working
  ask: "#a855f7", // status: input needed
};
const pctColor = (p) => (p == null ? C.dim : p >= 85 ? C.bad : p >= 60 ? C.warn : C.ok);
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const FONT = "-apple-system, Segoe UI, system-ui, sans-serif";

// Measured advance ratios for this font ran 0.528-0.576 of the font size per
// character. 0.60 over-estimates deliberately: it can only ever choose a SMALLER
// size, so nothing silently overflows the 144 box. Before this existed the ALWAYS
// key's rule line measured 199 units wide inside 144 and was clipped on both sides,
// and "$2399.28" rendered 143 wide — edge to edge with no margin.
const ADVANCE = 0.6;
const fit = (s, maxW, ideal, min = 11) =>
  Math.max(min, Math.min(ideal, Math.floor(maxW / (ADVANCE * Math.max(1, String(s).length)))));
const fits = (s, maxW, size) => String(s).length * ADVANCE * size <= maxW;
// Longest string that can be drawn at `size` inside `maxW`.
const capacity = (maxW, size) => Math.max(1, Math.floor(maxW / (ADVANCE * size)));

// fit() alone is NOT a guarantee: it stops shrinking at `min`, so anything long enough
// still overflows. Truncation is the backstop that makes it total. Every text in this
// module goes through line(), so overflow is structurally impossible rather than
// merely unlikely — which is the difference that let two strings ship clipped.
function fitClip(s, maxW, ideal, min = 11) {
  const str = String(s);
  const size = fit(str, maxW, ideal, min);
  if (fits(str, maxW, size)) return [str, size];
  return [str.slice(0, Math.max(1, capacity(maxW, size) - 1)) + "…", size];
}

const txt = (x, y, size, weight, fill, s, anchor = "middle", extra = "") =>
  `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" fill="${fill}"${extra}>${esc(s)}</text>`;

// The only way text should be emitted: shrink to fit, then clip if even `min` is short.
const line = (x, y, maxW, ideal, weight, fill, s, anchor = "middle", extra = "", min = 11) => {
  const [t, size] = fitClip(s, maxW, ideal, min);
  return txt(x, y, size, weight, fill, t, anchor, extra);
};

const svgWrap = (inner) =>
  "data:image/svg+xml," + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="144" height="144" viewBox="0 0 144 144"><rect width="144" height="144" rx="18" fill="${C.bg}"/>${inner}</svg>`);

// Translucent wash plus concentric strokes that read as a glow. Concentric strokes
// rather than feGaussianBlur: the Stream Deck renderer can't be relied on for filters.
// `strong` is for the "blocked on you" states.
function tintFrame(col, strong = false, phase = null) {
  if (!col) return "";
  // phase != null → breathe across the ticker's 3 frames. The 5px stroke is what the
  // eye tracks, so it has to swing; holding it constant made the breath imperceptible
  // at arm's length while still paying the full frame cost.
  const p = phase == null ? 1 : [0.3, 0.65, 1][phase % 3];
  const washOp = (strong ? 0.22 : 0.1) * (phase == null ? 1 : 0.6 + 0.4 * p);
  const mainOp = phase == null ? (strong ? 1 : 0.8) : 0.25 + 0.75 * p;
  return `<rect width="144" height="144" rx="18" fill="${col}" opacity="${washOp.toFixed(3)}"/>
    <rect x="2" y="2" width="140" height="140" rx="17" fill="none" stroke="${col}" stroke-width="2" opacity="${((strong ? 0.45 : 0.22) * p).toFixed(3)}"/>
    <rect x="5" y="5" width="134" height="134" rx="15" fill="none" stroke="${col}" stroke-width="${strong ? 5 : 3}" opacity="${mainOp.toFixed(3)}"/>
    <rect x="9.5" y="9.5" width="125" height="125" rx="12" fill="none" stroke="${col}" stroke-width="1" opacity="${(0.18 * p).toFixed(3)}"/>`;
}

// ---------- glyphs (authored in a 24-unit box, stroked) ----------
// The redundant, colour-independent channel. ALLOW green and DENY red are 1.59:1
// apart in normal vision and 1.34:1 as a deuteranope sees them — both collapse to
// olive — so the mark, not the hue, is what separates them.
const GLYPHS = {
  allow: ["M4 13 L9.5 18.5 L20 6"],
  always: ["M2 13 L7 18 L16.5 6.5", "M10.5 18 L20 6.5"],
  deny: ["M6.5 6.5 L17.5 17.5", "M17.5 6.5 L6.5 17.5"],
  launch: ["M14 4 h6 v6", "M20 4 L12.5 11.5", "M17 14 v5 a1 1 0 0 1 -1 1 H5 a1 1 0 0 1 -1 -1 V8 a1 1 0 0 1 1 -1 h5"],
  chat: ["M3.5 6 h17 v10 h-9 l-5 4 v-4 h-3 z"],
  web: ["M12 3 a9 9 0 1 0 0.01 0", "M3 12 h18", "M12 3 a13 13 0 0 0 0 18 a13 13 0 0 0 0 -18"],
  code: ["M6 8 L10.5 12.5 L6 17", "M13 17 h5.5"],
  project: ["M3 18 V6 h6 l2 2.5 h10 V18 z"],
  prompt: ["M4 7 h16", "M4 12.5 h11", "M4 18 h7"],
  custom: ["M4 7.5 h16", "M4 16.5 h16", "M9 7.5 m0 0 a2.4 2.4 0 1 0 0.01 0", "M15 16.5 m0 0 a2.4 2.4 0 1 0 0.01 0"],
  focus: ["M12 12 m-7 0 a7 7 0 1 0 14 0 a7 7 0 1 0 -14 0", "M12 1.5 v4", "M12 18.5 v4", "M1.5 12 h4", "M18.5 12 h4"],
  // Report-kind marks. Report KEYS carry no glyph — that absence is the action-class
  // signal — but the Stream Deck action list needs one row icon per action, so these
  // exist for iconSvg() only.
  gauge: ["M3.5 18 a8.5 8.5 0 1 1 17 0", "M12 18 L16.5 10.5"],
  meter: ["M3.5 12.5 h17 a3 3 0 0 1 0 6 h-17 a3 3 0 0 1 0 -6 z", "M7 15.5 h6"],
  rising: ["M4 16.5 L10 10 L14 14 L20 7", "M20 12 V7 h-5"],
  layers: ["M12 3 L21 8 L12 13 L3 8 z", "M3 12.5 L12 17.5 L21 12.5", "M3 16.5 L12 21.5 L21 16.5"],
  list: ["M4 7 h13", "M4 12 h13", "M4 17 h13", "M20 7 m0 0 a1 1 0 1 0 0.01 0", "M20 12 m0 0 a1 1 0 1 0 0.01 0", "M20 17 m0 0 a1 1 0 1 0 0.01 0"],
  dot: ["M12 12 m-8 0 a8 8 0 1 0 16 0 a8 8 0 1 0 -16 0", "M12 12 m-2.6 0 a2.6 2.6 0 1 0 5.2 0 a2.6 2.6 0 1 0 -5.2 0"],
  clock: ["M12 12 m-8.5 0 a8.5 8.5 0 1 0 17 0 a8.5 8.5 0 1 0 -17 0", "M12 6.5 V12 l4 2.5"],
  calendar: ["M4 6.5 h16 v14 H4 z", "M4 11 h16", "M8 3 v4", "M16 3 v4"],
  week: ["M4 6.5 h16 v14 H4 z", "M4 11 h16", "M8 3 v4", "M16 3 v4", "M7.5 15 h3", "M13.5 15 h3"],
  grid: ["M4 4.5 h6 v6 H4 z", "M14 4.5 h6 v6 h-6 z", "M4 13.5 h6 v6 H4 z", "M14 13.5 h6 v6 h-6 z"],
};

// A standalone 72x72 icon for the Stream Deck action list, drawn from the same glyph
// table the keys use so the two surfaces can never drift. Before this, the 21 icon
// files carried FOUR different backgrounds (#1F1E1D, #16151c, a solid #D97757, and one
// with none at all) and their own hand-drawn art.
function iconSvg(glyphName, col = C.text) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 72 72">` +
    `<rect width="72" height="72" rx="14" fill="${C.bg}"/>` +
    glyph(glyphName, 16, 16, 40, col, 2.4).replace(/^<g /, '<g ') +
    `</svg>\n`;
}
function glyph(name, x, y, size, col, sw = 2.6) {
  const s = size / 24;
  // stroke-width is pre-divided by the scale so `sw` stays in final key units.
  return `<g transform="translate(${x},${y}) scale(${s.toFixed(4)})" fill="none" stroke="${col}" stroke-width="${(sw / s).toFixed(2)}" stroke-linecap="round" stroke-linejoin="round">` +
    (GLYPHS[name] ?? []).map((d) => `<path d="${d}"/>`).join("") + "</g>";
}

// ---------- shared skeleton ----------
const header = (s) =>
  line(12, 25, 106, 15, 700, C.dim, String(s).toUpperCase(), "start", ' letter-spacing="0.6"');
const foot = (s, col = C.dim) => (s ? line(72, 127, 130, 14, 400, col, s) : "");
const corner = (tag, col = C.dim) => (tag ? txt(132, 25, 12, 600, col, String(tag).slice(0, 8), "end") : "");
const badge = (n, col) =>
  `<circle cx="121" cy="20" r="11.5" fill="${C.panel}" stroke="${col}" stroke-width="1.5"/>` +
  txt(121, 25, 14, 700, C.text, n);

// The action-class marker. Weight differs by consequence so the three approve keys
// stay distinct in greyscale, where hue tells you nothing.
const band = {
  rule: (col, m = 1) => `<rect x="0" y="33" width="144" height="2.5" fill="${col}" opacity="${(0.85 * m).toFixed(2)}"/>`,
  double: (col, m = 1) => `<rect x="0" y="33" width="144" height="2.5" fill="${col}" opacity="${(0.85 * m).toFixed(2)}"/><rect x="0" y="38" width="144" height="1.5" fill="${col}" opacity="${(0.55 * m).toFixed(2)}"/>`,
  fill: (col, m = 1) => `<rect x="0" y="0" width="144" height="35" fill="${col}" opacity="${(0.9 * m).toFixed(2)}"/>`,
};
// Header row for an action key: glyph + title. Both in dim so they clear AA — drawing
// them in the rail colour measured 1.99:1, worse than what it replaced.
const actionHead = (glyphName, title, fg = C.dim) =>
  glyph(glyphName, 10, 8, 20, fg) +
  line(36, 25, 84, 15, 800, fg, String(title).toUpperCase(), "start", ' letter-spacing="0.5"');

// ================= REPORT KEYS — no band, no glyph, value in bone =================
// A press only cycles or refreshes what is already on screen, so nothing warns you.

function usageMeterKey(head, big, sub, isCost) {
  const none = String(big) === "--";
  return svgWrap(`
    ${header(head)}
    ${isCost && !none ? corner("est") : ""}
    ${line(72, 88, 128, 42, 700, none ? C.dim : C.text, big, "middle", "", 20)}
    ${foot(sub)}`);
}

function gaugeKey(label, pct, sub, pulsePhase = null) {
  const has = typeof pct === "number" && isFinite(pct);
  const p = has ? Math.max(0, Math.min(100, pct)) : 0;
  // The percentage crosses thresholds, so it IS state and keeps its colour.
  const col = has ? pctColor(p) : C.dim;
  const pulse = pulsePhase == null ? "" :
    `<rect x="4" y="4" width="136" height="136" rx="16" fill="none" stroke="${C.bad}" stroke-width="6" opacity="${[0.2, 0.55, 0.95][pulsePhase % 3]}"/>`;
  return svgWrap(`
    ${pulse}
    ${header(label)}
    ${line(72, 82, 128, has ? 44 : 32, 700, col, has ? Math.round(p) + "%" : "--")}
    <rect x="12" y="94" width="120" height="10" rx="5" fill="${C.track}"/>
    ${has ? `<rect x="12" y="94" width="${Math.max(7, (120 * p) / 100).toFixed(1)}" height="10" rx="5" fill="${col}"/>` : ""}
    ${foot(sub)}`);
}

function burnKey(tokensHour, sub) {
  const has = tokensHour != null;
  return svgWrap(`
    ${header("burn rate")}
    ${line(72, 84, 128, has ? 42 : 32, 700, has ? C.text : C.dim, has ? fmtNum(tokensHour) : "--")}
    ${txt(72, 105, 15, 400, C.dim, "tok/hr")}
    ${foot(sub)}`);
}

function linesKey(title, rows) {
  const rowSvg = rows.map((r, i) =>
    line(12, 64 + i * 30, 122, 21, r.big ? 700 : 600, r.color ?? C.text, r.text, "start")).join("");
  return svgWrap(`${header(title)}${rowSvg}`);
}

function bigCountKey(title, count, sub, subColor, animPhase = null, tint = null, strong = false) {
  // animPhase non-null → cycling activity dots beside the count (frame-pushed).
  const dots = animPhase == null ? "" : [0, 1, 2]
    .map((i) => `<circle cx="128" cy="${58 + i * 15}" r="${i === animPhase ? 4.5 : 3}" fill="${i === animPhase ? (tint ?? C.info) : C.track}"/>`)
    .join("");
  return svgWrap(`
    ${tintFrame(tint, strong)}
    ${header(title)}
    ${dots}
    ${line(72, 97, 118, 60, 700, count > 0 ? C.text : C.dim, count)}
    ${foot(sub, subColor ?? C.dim)}`);
}

const STATUS_LOOK = {
  "needs-approval": { label: "Needs approval", col: C.warn, strong: true },
  "input-needed": { label: "Input needed", col: C.ask, strong: true },
  working: { label: "Working", col: C.info },
  finished: { label: "Finished", col: C.ok },
  idle: { label: "Idle", col: C.dim },
  none: { label: "no session", col: C.dim },
  quiet: { label: "all clear", col: C.dim }, // Waiting key, nothing pending
  // A session that reports no status (VS Code extension) and whose transcript we
  // couldn't stat. Saying "no status" beats inventing "Idle".
  unknown: { label: "no status", col: C.dim },
};
function statusKey(name, st, count, detail = "", tag = "", phase = null) {
  const look = STATUS_LOOK[st] ?? STATUS_LOOK.none;
  const shown = String(name || "CLAUDE").slice(0, 11);
  // Count badge wins the corner; otherwise the "cli"/"code" tag, which is the only
  // way to tell two sessions in the same project apart.
  return svgWrap(`
    ${tintFrame(look.col, !!look.strong, phase)}
    ${count > 1 ? badge(count, look.col) : corner(tag)}
    ${line(72, 78, 128, 25, 700, st === "none" ? C.dim : C.text, shown)}
    ${line(72, 104, 130, 17, 700, look.col, look.label)}
    ${detail ? line(72, 127, 132, 13, 400, C.dim, detail) : ""}`);
}

function fmtNum(n) {
  if (n == null) return "--";
  if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "k";
  return String(n);
}

// ================= ACTION KEYS — band + glyph, the press leaves the deck =========

// The four actions that had no renderer at all and shipped as flat icon art, which is
// what ran two visual languages on one deck.
function actionKey(glyphName, title, label, sub) {
  const id = C.ident[glyphName] ?? C.rail;
  return svgWrap(`
    ${band.rule(id)}
    ${actionHead(glyphName, title, id)}
    ${line(72, 92, 128, 24, 700, C.text, label)}
    ${foot(sub)}`);
}

// Glyph is derived from the header so the call signature stays close to the original.
const GLYPH_FOR = { PROJECT: "project", FOCUS: "focus", PROMPT: "prompt", CLAUDE: "custom" };

// Generic key for configurable actions: header + wrapped label + footer.
function labelKey(title, label, sub, tint = null, strong = false) {
  const text = String(label ?? "").trim() || "—";
  const words = text.split(/\s+/);
  const lines = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length <= 11) cur = (cur + " " + w).trim();
    else { lines.push(cur); cur = w; if (lines.length === 2) break; }
  }
  if (cur && lines.length < 2) lines.push(cur);
  const use = lines.slice(0, 2).filter(Boolean);
  const body = use.map((l, i) =>
    line(72, use.length > 1 ? 76 + i * 26 : 92, 128, 23, 700, C.text, l)).join("");
  // The band carries this key's fixed IDENTITY hue and never varies with state; the
  // frame tint carries state alone. Colouring the band BY state is what made a working
  // FOCUS key impersonate the vivid-blue ALWAYS key sitting next to it in the profile.
  const g = GLYPH_FOR[String(title).toUpperCase()] ?? "custom";
  const id = C.ident[g] ?? C.rail;
  return svgWrap(`
    ${tintFrame(tint, strong)}
    ${band.rule(id)}
    ${actionHead(g, title, id)}
    ${body}
    ${foot(sub)}`);
}

const APPROVE_LOOK = {
  "approve-allow": { word: "ALLOW", col: C.ok, glyphName: "allow", weight: "rule" },
  "approve-always": { word: "ALWAYS", col: C.info, glyphName: "always", weight: "double" },
  "approve-deny": { word: "DENY", col: C.bad, glyphName: "deny", weight: "fill" },
};

// Splits a rule until every line reaches a legible size, rather than trusting a single
// break at "(": the shipped version's second line measured 199 units in a 144 box and
// was clipped on both sides, so every WebFetch domain grant was unreadable on the one
// key that produces a durable write.
//
// The gate is the size a line can ACHIEVE, not a fixed size it must fit at. Asking
// "does it fit at 19px" split `Bash(npm test)` across two lines even though it renders
// perfectly well at 15.
const RULE_W = 132;
const RULE_IDEAL = 19;
const RULE_GOOD = 13; // below this a line is too small to read at arm's length
function ruleLines(rule) {
  const good = (s) => fit(s, RULE_W, RULE_IDEAL) >= RULE_GOOD;
  if (good(rule)) return [rule];

  const at = rule.indexOf("(");
  let parts = at >= 0 ? [rule.slice(0, at), rule.slice(at)] : [rule];
  if (!parts.every(good)) {
    // Break the tail at ":" — for `WebFetch(domain:x)` that isolates the part which
    // actually identifies the grant, which is the part that must stay legible.
    const tail = parts[parts.length - 1];
    const colon = tail.indexOf(":");
    if (colon >= 0) {
      parts = [
        ...parts.slice(0, -1),
        tail.slice(0, colon + 1).replace(/^\(/, ""),
        tail.slice(colon + 1).replace(/\)$/, ""),
      ];
    }
  }
  // Last resort for a rule that structure alone can't tame: hard-wrap at the widest
  // chunk RULE_GOOD allows, so a line is never clipped just because it lacked a "(".
  const out = [];
  for (const p of parts.filter(Boolean)) {
    if (good(p)) { out.push(p); continue; }
    const max = capacity(RULE_W, RULE_GOOD);
    for (let i = 0; i < p.length; i += max) out.push(p.slice(i, i + max));
  }
  return out;
}

// Nothing pending -> a calm dim look. A pending request tints the frame and (while
// fresh) breathes. ALLOW/DENY show the command; ALWAYS shows the RULE it would
// persist, because Claude Code's suggestions are wildcards.
function approveKey(kind, req, o = {}) {
  const look = APPROVE_LOOK[kind];
  const shell = (col, mult, bodyLines, sub, cornerSvg = "", wordOverride = null) => {
    // On DENY the band is a solid fill, so its glyph and word sit ON the fill.
    const onBand = kind === "approve-deny" && mult === 1 ? C.bg : col;
    // Body lives between the band (ends y=40) and the footer (y=127). Baselines are
    // tabulated rather than computed so a 4-line rule can't push text off the key.
    const n = Math.min(4, bodyLines.length);
    const [top, step] = [[92, 0], [78, 26], [68, 22], [62, 18]][n - 1] ?? [92, 0];
    const body = bodyLines.slice(0, n).map((l, i) =>
      line(72, top + i * step, RULE_W, l.max ?? 22, 700, l.col ?? C.text, l.t)).join("");
    return svgWrap(`
      ${tintFrame(col, mult === 1, o.phase ?? null)}
      ${band[look.weight](col, mult)}
      ${actionHead(look.glyphName, wordOverride ?? look.word, onBand)}
      ${cornerSvg}
      ${body}
      ${foot(sub)}`);
  };

  if (o.err) return shell(C.bad, 1, [], o.err);
  if (!req) return shell(C.dim, 0.4, [], "all clear");

  const { name, target } = describeRequest(req);
  const rule = kind === "approve-always" ? alwaysRule(req, !!o.sessionOnly) : null;
  // o.denied is set when this target's rule was DENIED in the last DENY_WINDOW_MS. The
  // rule still renders, greyed: the user needs to see WHAT is blocked, and hiding it
  // would make this look like the unrelated "n/a" case.
  const denied = kind === "approve-always" && rule !== null && !!o.denied;
  const disabled = kind === "approve-always" && (rule === null || denied);
  const col = disabled ? C.dim : look.col;
  const mult = disabled ? 0.4 : 1;
  // Depth badge wins the corner, else an optional user label. The project name keeps
  // the footer unconditionally: it is a wrong-request mitigation, so a cosmetic label
  // must not be able to hide it.
  const cornerSvg = o.depth > 1 ? badge(o.depth, col) : corner(o.label);
  const word = kind === "approve-always"
    ? (denied ? "ALWAYS" : rule === null ? "ALWAYS n/a" : `ALWAYS ·${o.sessionOnly ? "ses" : "prj"}`)
    : look.word;

  if (denied) {
    return shell(col, mult, ruleLines(rule).map((t) => ({ t, col: C.dim, max: 18 })), String(o.denied), cornerSvg, word);
  }
  const shown = kind === "approve-always" ? (rule ?? target) : target;
  const lines = kind === "approve-always" && rule != null
    ? ruleLines(rule).map((t) => ({ t, max: 19 }))
    : [{ t: shown, max: 24 }];
  return shell(col, mult, lines, name, cornerSvg, word);
}

export {
  C, pctColor, esc, tintFrame, svgWrap, fit, fits, txt, glyph, iconSvg, ruleLines,
  gaugeKey, linesKey, bigCountKey, burnKey, usageMeterKey, labelKey, actionKey,
  STATUS_LOOK, statusKey, APPROVE_LOOK, approveKey, fmtNum,
};
