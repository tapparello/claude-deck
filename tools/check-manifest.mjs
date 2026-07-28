// Validates the manifest, the icon sets and the Property Inspector.
// Run with `npm run check:manifest`; CI runs the same script.
//
// This lived inline in ci.yml as a `node -e "…"` one-liner and had to move: any
// check that needs a literal double quote — and the icon rules below are all about
// `fill="…"` and `stroke="…"` — terminates the shell string early. That failed on
// all three runners at once (bash: "syntax error near unexpected token `('";
// PowerShell: ParserError), while passing locally, because testing it locally meant
// extracting the JS and running it directly, which skips the quoting entirely.
// A file cannot have that failure mode, and eslint checks it like any other source.
import fs from "node:fs";

const DIR = "dev.tapparello.claude-deck.sdPlugin/";
const fail = (msg) => { console.error("✖ " + msg); process.exitCode = 1; };

const m = JSON.parse(fs.readFileSync(DIR + "manifest.json", "utf8"));
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));

// ---------- version ----------
if (!/^\d+\.\d+\.\d+\.\d+$/.test(m.Version)) fail(`Version must be 4-part: ${m.Version}`);
// The manifest is the source of truth (Stream Deck demands 4 parts), but
// package.json drifted to 1.0.0 while the plugin shipped 1.8.0.0. Require the
// manifest to extend the package version, leaving the 4th part free as a build number.
if (!m.Version.startsWith(pkg.version + ".")) {
  fail(`manifest Version ${m.Version} does not extend package.json version ${pkg.version}`);
}

// ---------- action identity ----------
const uuids = m.Actions.map((a) => a.UUID);
if (new Set(uuids).size !== uuids.length) fail("duplicate action UUID");
for (const a of m.Actions) {
  if (!a.UUID.startsWith(m.UUID + ".")) fail(`action outside the plugin namespace: ${a.UUID}`);
}
// Marketplace guidance: between 2 and 30 actions, or split the plugin.
if (m.Actions.length < 2 || m.Actions.length > 30) {
  fail(`Marketplace expects 2-30 actions, found ${m.Actions.length}`);
}

// ---------- the plugin icon is the one PNG surface ----------
// 256 plus a 512 @2x, and it must NOT also exist as .svg: manifest icon paths carry
// no extension, so shipping both makes Stream Deck's choice a coin toss.
if (!fs.existsSync(DIR + m.Icon + ".png")) fail(`plugin Icon must exist as PNG: ${m.Icon}`);
if (!fs.existsSync(DIR + m.Icon + "@2x.png")) fail(`plugin Icon needs a @2x PNG: ${m.Icon}`);
if (fs.existsSync(DIR + m.Icon + ".svg")) fail(`plugin Icon exists as both .svg and .png: ${m.Icon}`);

// ---------- action-list icons are monochrome white on transparent ----------
// A Marketplace requirement, and the opposite of what the KEY art does (filled
// plate, identity hues), which is why the two sets cannot be shared.
const WHITE = 'stroke="#FFFFFF"';
const FILL_RE = /fill="(?!none)[^"]+"/g;
const STROKE_RE = /stroke="[^"]+"/g;

if (!fs.existsSync(DIR + m.CategoryIcon + ".svg")) fail(`missing CategoryIcon: ${m.CategoryIcon}`);
for (const icon of [m.CategoryIcon, ...m.Actions.map((a) => a.Icon)]) {
  const path = DIR + icon + ".svg";
  if (!fs.existsSync(path)) { fail(`missing action-list icon: ${icon}`); continue; }
  const svg = fs.readFileSync(path, "utf8");
  const fills = svg.match(FILL_RE) ?? [];
  if (fills.length) fail(`${icon} has a fill (list icons must be stroke-only): ${fills[0]}`);
  for (const stroke of svg.match(STROKE_RE) ?? []) {
    if (stroke !== WHITE) fail(`${icon} is not monochrome white: ${stroke}`);
  }
}

// ---------- key art and property inspectors ----------
for (const a of m.Actions) {
  for (const image of (a.States ?? []).map((s) => s.Image)) {
    if (image && !fs.existsSync(DIR + image + ".svg")) fail(`missing state image: ${image}`);
  }
  if (a.PropertyInspectorPath && !fs.existsSync(DIR + a.PropertyInspectorPath)) {
    fail(`missing PI: ${a.PropertyInspectorPath}`);
  }
}

// The PI is plain HTML with one inline script; parse it so a syntax error there
// surfaces here rather than as a silently blank settings pane.
const pi = fs.readFileSync(DIR + "pi/pi.html", "utf8");
try {
  new Function(pi.split("<script>")[1].split("</script>")[0]);
} catch (e) {
  fail(`pi.html script does not parse: ${e.message}`);
}

if (!process.exitCode) {
  console.log(`manifest OK: v${m.Version}, ${m.Actions.length} actions, ` +
    `${m.Actions.length + 1} list icons monochrome, plugin icon PNG @1x+@2x, PI parses`);
}
