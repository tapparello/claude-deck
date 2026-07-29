// Renders every key, in every interesting state, into a single SVG for the README.
// Run with `npm run showcase`.
//
// Generated from src/keyart.js rather than screenshotted, for the same reason the
// action-list icons are generated: a hand-captured image goes stale the moment the art
// changes, and the old README shots outlived the design they documented by one whole
// redesign. This regenerates in a second with zero dependencies.
//
// docs/keys.svg is the canonical artifact. docs/keys.png is a raster snapshot of it for
// hosts that will not render SVG; see the README for how to refresh it.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as K from "../src/keyart.js";

const C = K.C;
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PHASE = 2; // fixed, so the output is byte-stable between runs

// Each renderer returns a complete <svg> as a data URI. Unwrap it so several can be
// composed into one canvas.
const inner = (dataUri) => {
  const svg = decodeURIComponent(dataUri.replace(/^data:image\/svg\+xml,/, ""));
  return svg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
};

const rule = (r) => [{
  type: "addRules", behavior: "allow",
  rules: [{ toolName: r.split("(")[0], ruleContent: r.slice(r.indexOf("(") + 1, -1) }],
}];
const WEBFETCH = { cwd: "/Users/you/dev/agent-vitals", toolName: "WebFetch", toolInput: { url: "https://docs.amplify.aws/x" }, suggestions: rule("WebFetch(domain:docs.amplify.aws)") };

const ROWS = [
  ["Usage and activity — a press cycles or refreshes, so no band", [
    ["session 5h", K.gaugeKey("session 5h", 94, "1h 5m left", PHASE)],
    ["weekly", K.gaugeKey("weekly", 61, "3d left")],
    ["cost", K.usageMeterKey("this month", "$2420.37", "cost", true)],
    ["tokens", K.usageMeterKey("7-day", "1.1B", "tokens", false)],
    ["per model", K.usageMeterKey("opus 7d 1/3", "$927.96", "est", true)],
    ["burn rate", K.burnKey(43_800_000, "$60.33 last 5h")],
    ["today", K.linesKey("today", [{ text: "16 chats" }, { text: "804 msgs" }, { text: "95.4M tok" }])],
    ["sessions", K.bigCountKey("claude code", 7, "1 working", C.info, PHASE, C.info, false)],
  ]],
  ["Shortcuts — an identity cap, because the press leaves the deck", [
    ["launch", K.actionKey("launch", "launch", "Desktop", "claude app")],
    ["quick chat", K.actionKey("chat", "chat", "New chat", "claude desktop")],
    ["claude.ai", K.actionKey("web", "claude.ai", "Open", "in browser")],
    ["terminal", K.actionKey("code", "code", "Terminal", "~/Developer")],
    ["focus", K.labelKey("FOCUS", "agent-vitals", "working", C.info)],
    ["project", K.labelKey("PROJECT", "agent-vitals", "")],
    ["quick prompt", K.labelKey("PROMPT", "ship it", "")],
    ["custom", K.labelKey("CLAUDE", "custom", "")],
  ]],
  ["Session status — colour is state, and only state", [
    ["idle", K.statusKey("agent-vitals", "idle", 1, "24m idle", "cli")],
    ["working", K.statusKey("agent-vitals", "working", 1, "", "cli", PHASE)],
    ["finished", K.statusKey("agent-vitals", "finished", 1, "", "cli")],
    ["needs approval", K.statusKey("agent-vitals", "needs-approval", 1, "WebFetch · 4s", "cli", PHASE)],
    ["input needed", K.statusKey("agent-vitals", "input-needed", 1, "", "cli", PHASE)],
    ["two sessions", K.statusKey("agent-vitals", "working", 2, "", "", PHASE)],
    ["waiting, quiet", K.statusKey("WAITING", "quiet", 1, "7 sessions ok")],
    ["no session", K.statusKey("", "none", 1, "")],
  ]],
  ["Answering a permission prompt — rule, double rule, fill: three silhouettes", [
    ["allow, idle", K.approveKey("approve-allow", null, {})],
    ["always, idle", K.approveKey("approve-always", null, {})],
    ["deny, idle", K.approveKey("approve-deny", null, {})],
    ["allow", K.approveKey("approve-allow", WEBFETCH, { depth: 3, phase: PHASE })],
    ["always", K.approveKey("approve-always", WEBFETCH, { depth: 3, phase: PHASE })],
    ["deny", K.approveKey("approve-deny", WEBFETCH, { depth: 3, phase: PHASE })],
    ["just denied", K.approveKey("approve-always", WEBFETCH, { denied: "just denied" })],
    ["hook error", K.approveKey("approve-deny", null, { err: "port in use" })],
  ]],
];

const KEY = 144, GAP = 18, PAD = 34, CAPH = 22, HEADH = 34, ROWGAP = 30;
const FONT = "-apple-system, BlinkMacSystemFont, Segoe UI, system-ui, sans-serif";

// Lays rows of keys onto one canvas. `heading` is optional; without it the sheet is
// just the keys, which is what the action-key strip wants.
function sheet(rows, heading = null) {
  const cols = Math.max(...rows.map(([, keys]) => keys.length));
  const W = PAD * 2 + cols * KEY + (cols - 1) * GAP;
  const top0 = PAD + (heading ? 26 : 0);
  const H = top0 + rows.length * (HEADH + KEY + CAPH) + (rows.length - 1) * ROWGAP + PAD;
  let out = heading
    ? `<text x="${PAD}" y="${PAD + 4}" font-family="${FONT}" font-size="19" font-weight="700" fill="${C.text}">${heading}</text>`
    : "";
  let y = top0;
  for (const [title, keys] of rows) {
    out += `<text x="${PAD}" y="${y + 14}" font-family="${FONT}" font-size="13" font-weight="600" fill="${C.dim}" letter-spacing="0.3">${title}</text>`;
    const top = y + HEADH;
    keys.forEach(([cap, art], i) => {
      const x = PAD + i * (KEY + GAP);
      out += `<g transform="translate(${x},${top})">${inner(art)}</g>`;
      out += `<text x="${x + KEY / 2}" y="${top + KEY + 15}" text-anchor="middle" font-family="${FONT}" font-size="11" fill="${C.dim}">${cap}</text>`;
    });
    y = top + KEY + CAPH + ROWGAP;
  }
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<rect width="${W}" height="${H}" fill="#0d0d11"/>
${out}
</svg>
`, W, H };
}

fs.mkdirSync(path.join(ROOT, "docs"), { recursive: true });
const files = [
  ["keys.svg", sheet(ROWS, "Agent Vitals — key art"), ROWS.reduce((n, r) => n + r[1].length, 0)],
  // The shortcut strip on its own: one identity hue per action, which is the clearest
  // single view of the design.
  ["actions.svg", sheet([ROWS[1]]), ROWS[1][1].length],
];
for (const [name, { svg, W, H }, n] of files) {
  fs.writeFileSync(path.join(ROOT, "docs", name), svg);
  console.log(`wrote docs/${name} (${W}x${H}, ${n} keys)`);
}
