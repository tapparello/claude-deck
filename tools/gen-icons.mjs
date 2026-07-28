// Regenerates every action-list icon from the glyph table the KEYS use, so the two
// surfaces cannot drift. Run with `npm run icons`.
//
// Before this existed the 21 hand-authored files had drifted badly: FOUR different
// backgrounds (#1F1E1D on fourteen of them, #16151c on the five approver-era ones, a
// solid #D97757 on launch, and none at all on usage), plus their own art that shared
// nothing with what the plugin actually pushes to the key.
//
// Colour follows the same rule as the keys: bone for everything, and hue ONLY where it
// carries meaning — the three approve decisions.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { iconSvg, C } from "../src/keyart.js";

const OUT = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))),
  "dev.tapparello.claude-deck.sdPlugin", "imgs");

// file name -> [glyph, colour]. One distinct mark per action; no two actions share one.
const ICONS = {
  // usage / reporting
  session: ["gauge", C.text],
  weekly: ["week", C.text],
  model: ["layers", C.text],
  "usage": ["meter", C.text],
  burn: ["rising", C.text],
  today: ["calendar", C.text],
  sessions: ["list", C.text],
  // shortcuts
  launch: ["launch", C.text],
  chat: ["chat", C.text],
  web: ["web", C.text],
  code: ["code", C.text],
  project: ["project", C.text],
  focus: ["focus", C.text],
  prompt: ["prompt", C.text],
  custom: ["custom", C.text],
  // approver
  status: ["dot", C.text],
  waiting: ["clock", C.text],
  "approve-allow": ["allow", C.ok],
  "approve-always": ["always", C.info],
  "approve-deny": ["deny", C.bad],
  // category icon for the whole plugin
  plugin: ["grid", C.text],
};

const existing = fs.readdirSync(OUT).filter((f) => f.endsWith(".svg")).map((f) => f.replace(/\.svg$/, ""));
const missing = existing.filter((f) => !(f in ICONS));
if (missing.length) {
  console.error(`refusing to run: ${missing.join(", ")} exist on disk but have no mapping`);
  process.exit(1);
}

for (const [name, [glyphName, col]] of Object.entries(ICONS)) {
  fs.writeFileSync(path.join(OUT, `${name}.svg`), iconSvg(glyphName, col));
}
console.log(`wrote ${Object.keys(ICONS).length} icons to ${path.relative(process.cwd(), OUT)}`);
