// Validates the bundled Stream Deck profile against the manifest.
// Run with `npm run check:profile`; CI runs the same script.
//
// Two failures this catches, both of which have already happened:
//
//  1. COVERAGE DRIFT. The profile shipped placing 14 of 20 actions — importers got
//     a layout with no Session 5h or Weekly gauge. HANDOFF said "re-export it
//     whenever you add an action" and nothing enforced it.
//  2. NAMESPACE DRIFT. Every action in the profile embeds the plugin UUID. After the
//     Claude Deck -> Agent Vitals rename, a profile still carrying the old UUIDs
//     would import cleanly and then reference a plugin that is not installed —
//     silently dead keys, no error anywhere.
//
// No zip dependency: Node ships no archive reader, but the profile is plain
// stored/deflate with no zip64, so the central directory is ~40 lines to walk and
// zlib.inflateRawSync does the rest. The alternative was another devDependency for
// a repo whose only runtime dep is `ws`.
import fs from "node:fs";
import { inflateRawSync } from "node:zlib";

// Overridable so the negative cases can be exercised against a deliberately broken
// copy without swapping the real artifact in and out.
const PROFILE = process.argv[2] ?? "AgentVitals.streamDeckProfile";
const PLUGIN_DIR = "dev.tapparello.agent-vitals.sdPlugin";

const fail = (msg) => { console.error("✖ " + msg); process.exitCode = 1; };

// ---------- minimal zip reader ----------
function readZip(path) {
  const buf = fs.readFileSync(path);
  // End of central directory: scan back for the signature (comment is usually empty).
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("not a zip: no end-of-central-directory record");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = new Map();
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("bad central directory entry");
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const cmtLen = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    if (!name.endsWith("/")) {
      // The local header repeats the name/extra, and only it knows their real
      // lengths — the central directory's extra field can differ.
      const lNameLen = buf.readUInt16LE(localOff + 26);
      const lExtraLen = buf.readUInt16LE(localOff + 28);
      const start = localOff + 30 + lNameLen + lExtraLen;
      const raw = buf.subarray(start, start + compSize);
      files.set(name, method === 8 ? inflateRawSync(raw) : Buffer.from(raw));
    }
    p += 46 + nameLen + extraLen + cmtLen;
  }
  return files;
}

// ---------- load both sides ----------
if (!fs.existsSync(PROFILE)) { fail(`${PROFILE} is missing`); process.exit(1); }
const manifest = JSON.parse(fs.readFileSync(`${PLUGIN_DIR}/manifest.json`, "utf8"));
const declared = new Set(manifest.Actions.map((a) => a.UUID));

let files;
try { files = readZip(PROFILE); } catch (e) { fail(`cannot read ${PROFILE}: ${e.message}`); process.exit(1); }

const json = (name) => JSON.parse(files.get(name).toString("utf8"));
const topName = [...files.keys()].find((n) => n.split("/").length === 2 && n.endsWith("manifest.json"));
if (!topName) { fail("profile has no top-level manifest.json"); process.exit(1); }
const top = json(topName);

// Page id -> its Actions map.
const pages = new Map();
for (const name of files.keys()) {
  if (!name.endsWith("manifest.json") || !name.includes("/Profiles/")) continue;
  const id = name.split("/Profiles/")[1].split("/")[0].toLowerCase();
  const ctrl = json(name).Controllers;
  pages.set(id, (Array.isArray(ctrl) ? ctrl[0]?.Actions : null) ?? {});
}

// ---------- reachability ----------
// Top-level pages AND the default page, then anything opened by an openchild key.
// Following openchild is load-bearing: a walker that only reads Pages.Pages
// reported 13/20 on a profile that was in fact complete, because 7 of the actions
// live in a folder.
const OPENCHILD = "com.elgato.streamdeck.profile.openchild";
const reachable = new Set();
const queue = [...(top.Pages?.Pages ?? []), top.Pages?.Default].filter(Boolean).map((s) => s.toLowerCase());
while (queue.length) {
  const id = queue.pop();
  if (reachable.has(id) || !pages.has(id)) continue;
  reachable.add(id);
  for (const a of Object.values(pages.get(id))) {
    if (a?.UUID === OPENCHILD) {
      const child = a.Settings?.ProfileUUID?.toLowerCase();
      if (child) queue.push(child);
    }
  }
}
const unreachable = [...pages.keys()].filter((p) => !reachable.has(p));

// ---------- checks ----------
const placed = new Set();
const foreign = new Set();
for (const id of reachable) {
  for (const a of Object.values(pages.get(id))) {
    const uuid = a?.UUID;
    if (!uuid) continue;
    if (declared.has(uuid)) placed.add(uuid);
    else if (uuid.startsWith("dev.tapparello.")) foreign.add(uuid); // ours, but not a current action
    // Anything else is an Elgato built-in (openchild/backtoparent) — fine.
    // Every action also embeds the plugin it belongs to; that must be THIS plugin.
    const emb = a.Plugin?.UUID;
    if (emb && emb.startsWith("dev.tapparello.") && emb !== manifest.UUID) {
      foreign.add(`${uuid} (embedded plugin ${emb})`);
    }
  }
}

const missing = [...declared].filter((u) => !placed.has(u)).map((u) => u.split(".").pop());
if (missing.length) {
  fail(`profile places ${placed.size}/${declared.size} actions — missing: ${missing.join(", ")}\n` +
       `  Re-export the profile (see HANDOFF "Repo shape") so importers get every key.`);
}
for (const f of foreign) {
  fail(`stale reference in the profile: ${f}\n  Expected the ${manifest.UUID} namespace.`);
}

if (!process.exitCode) {
  const note = unreachable.length ? `, ${unreachable.length} unreachable page(s) ignored` : "";
  console.log(`profile OK: "${top.Name}" places all ${declared.size} actions across ` +
    `${reachable.size} reachable page(s)${note}, all in the ${manifest.UUID} namespace`);
}
