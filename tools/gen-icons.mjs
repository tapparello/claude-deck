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
import { Resvg } from "@resvg/resvg-js";
import { iconSvg, listIconSvg, C } from "../src/keyart.js";

const OUT = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))),
  "dev.tapparello.agent-vitals.sdPlugin", "imgs");
// Action-list art lives in its own directory. It cannot share files with the key
// art: Elgato requires the list icons to be monochrome white on TRANSPARENT, while
// the key icons are a filled dark plate with identity hues. Same glyph table, two
// renderings — see listIconSvg in src/keyart.js.
const LIST_OUT = path.join(OUT, "list");

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
  // shortcuts — each carries its own identity hue, matching the band on its key
  launch: ["launch", C.ident.launch],
  chat: ["chat", C.ident.chat],
  web: ["web", C.ident.web],
  code: ["code", C.ident.code],
  project: ["project", C.ident.project],
  focus: ["focus", C.ident.focus],
  prompt: ["prompt", C.ident.prompt],
  custom: ["custom", C.ident.custom],
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

fs.mkdirSync(LIST_OUT, { recursive: true });
for (const [name, [glyphName, col]] of Object.entries(ICONS)) {
  // "plugin" is the PNG-only plugin icon (below) and the category icon (list set).
  // Deliberately no imgs/plugin.svg: Stream Deck resolves manifest icon paths
  // without an extension, so shipping both plugin.svg and plugin.png makes which
  // one it picks a coin toss — deploy.sh has always deleted the .svg for exactly
  // this reason when swapping in a local PNG.
  if (name !== "plugin") fs.writeFileSync(path.join(OUT, `${name}.svg`), iconSvg(glyphName, col));
  // 28px for the category icon, 20px for the actions themselves (Elgato's sizes).
  fs.writeFileSync(path.join(LIST_OUT, `${name}.svg`), listIconSvg(glyphName, name === "plugin" ? 28 : 20));
}

// The plugin icon must be PNG — 256x256, plus a 512x512 @2x — where every other
// surface takes SVG. Rasterized here from the same source rather than exported by
// hand from a drawing app, so it cannot drift from the glyph table either.
const pluginSvg = iconSvg("grid", C.text);
for (const [file, px] of [["plugin.png", 256], ["plugin@2x.png", 512]]) {
  const png = new Resvg(pluginSvg, { fitTo: { mode: "width", value: px } }).render().asPng();
  fs.writeFileSync(path.join(OUT, file), png);
}

console.log(`wrote ${Object.keys(ICONS).length - 1} key icons to ${path.relative(process.cwd(), OUT)}`);
console.log(`wrote ${Object.keys(ICONS).length} list icons to ${path.relative(process.cwd(), LIST_OUT)}`);
console.log("wrote plugin.png (256) and plugin@2x.png (512)");
