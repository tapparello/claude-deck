// Renders docs/og.png — the 1200x630 card Google, Slack, Reddit and X show when the
// landing page or the repo is linked. Run with `npm run og`.
//
// Same reasoning as gen-showcase: the keys on the card come from src/keyart.js, so the
// card cannot show a design the plugin no longer has. The full key sheet is unreadable
// at card size (32 keys in a 1200px-wide thumbnail), so this picks four that carry the
// pitch on their own — a gauge, a session count, a session that needs approval, and the
// key you press to answer it — one per state colour.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import * as K from "../src/keyart.js";

const C = K.C;
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PHASE = 2; // fixed, so the output is byte-stable between runs

const inner = (dataUri) => {
  const svg = decodeURIComponent(dataUri.replace(/^data:image\/svg\+xml,/, ""));
  return svg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
};

const WEBFETCH = {
  // Short enough that the key does not have to truncate it. The sample name is only
  // cosmetic here, and a clipped "agent-vital" reads as a typo at card size.
  cwd: "/Users/you/dev/checkout",
  toolName: "WebFetch",
  toolInput: { url: "https://docs.amplify.aws/x" },
  suggestions: [{
    type: "addRules", behavior: "allow",
    rules: [{ toolName: "WebFetch", ruleContent: "domain:docs.amplify.aws" }],
  }],
};

const W = 1200, H = 630;
const KEY = 144, SCALE = 1.6, GAP = 22, PAD = 72;
const GRID = 2 * KEY * SCALE + GAP;
const GX = W - PAD - GRID, GY = Math.round((H - GRID) / 2);
const FONT = "-apple-system, BlinkMacSystemFont, Segoe UI, system-ui, sans-serif";

// Red, blue, amber, green — the four state colours, so the card reads as a system even
// at thumbnail size where none of the labels are legible.
const CARDS = [
  K.gaugeKey("session 5h", 94, "1h 5m left", PHASE),
  K.bigCountKey("claude code", 7, "1 working", C.info, PHASE, C.info, false),
  K.statusKey("checkout", "needs-approval", 1, "WebFetch · 4s", "cli", PHASE),
  K.approveKey("approve-allow", WEBFETCH, { depth: 3, phase: PHASE }),
];

const text = (x, y, size, weight, fill, s) =>
  `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" fill="${fill}">${K.esc(s)}</text>`;

const keys = CARDS.map((art, i) => {
  const x = GX + (i % 2) * (KEY * SCALE + GAP);
  const y = GY + Math.floor(i / 2) * (KEY * SCALE + GAP);
  return `<g transform="translate(${x},${y}) scale(${SCALE})">${inner(art)}</g>`;
}).join("\n");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<rect width="${W}" height="${H}" fill="#0d0d11"/>
${text(PAD, 197, 62, 700, C.text, "Agent Vitals")}
${text(PAD, 245, 32, 500, C.text, "A Stream Deck plugin")}
${text(PAD, 283, 32, 500, C.text, "for Claude Code")}
<rect x="${PAD}" y="318" width="46" height="3" rx="1.5" fill="${C.ok}"/>
${text(PAD, 365, 21, 400, C.dim, "Live usage gauges")}
${text(PAD, 397, 21, 400, C.dim, "Session status at a glance")}
${text(PAD, 429, 21, 400, C.dim, "Allow or deny from the deck")}
${text(PAD, 489, 18, 500, C.rail, "github.com/tapparello/agent-vitals")}
${keys}
</svg>
`;

fs.mkdirSync(path.join(ROOT, "docs"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "docs", "og.svg"), svg);
const png = new Resvg(svg, { fitTo: { mode: "width", value: W } }).render().asPng();
fs.writeFileSync(path.join(ROOT, "docs", "og.png"), png);
console.log(`wrote docs/og.svg and docs/og.png (${W}x${H}, ${CARDS.length} keys)`);
