// Pure decision logic for the physical approver. No I/O: every function is a
// fixture-testable transform. See docs/superpowers/specs/2026-07-25-approver-design.md §4.1.

export const DENY_MESSAGE = "Denied from Stream Deck";
export const PORT_DEFAULT = 45623;

// Claude Code may suggest six kinds of permission update. Only ONE is safe to echo
// back: adding an allow rule that names a concrete ruleContent. Clamping the
// `destination` is not enough — a `setMode` clamped to localSettings still writes
// defaultMode:"acceptEdits" into the project permanently, and an `addDirectories`
// grants a whole directory from a key that showed a filename.
export function sanitizeSuggestions(suggestions, toolName, sessionOnly = false) {
  if (!Array.isArray(suggestions)) return [];
  // MCP tools are refused outright: their suggestions are frequently whole-tool grants
  // that Claude Code's own dialog declines to offer, and on this machine the MCP server
  // in question holds an Azure DevOps PAT.
  if (String(toolName ?? "").startsWith("mcp__")) return [];
  const out = [];
  for (const e of suggestions) {
    if (!e || typeof e !== "object") continue;
    if (e.type !== "addRules" || e.behavior !== "allow") continue;
    if (!Array.isArray(e.rules)) continue;
    const rules = e.rules.filter(
      (r) => r && typeof r.toolName === "string" && r.toolName &&
             typeof r.ruleContent === "string" && r.ruleContent,
    ).map((r) => ({ toolName: r.toolName, ruleContent: r.ruleContent }));
    if (!rules.length) continue;
    // `session` is a floor we never widen; anything else becomes localSettings —
    // the project's .claude/settings.local.json, never the cloud-synced user file.
    const destination = sessionOnly || e.destination === "session" ? "session" : "localSettings";
    out.push({ type: "addRules", behavior: "allow", destination, rules });
  }
  return out;
}

const wrap = (decision) => ({ hookSpecificOutput: { hookEventName: "PermissionRequest", decision } });

// The ONE suggestion this request would persist, or null when the set is empty or
// ambiguous (more than one entry, or more than one rule). Both the ALWAYS key's label
// (Task 2's alwaysRule) and its decision come from here, so a key that renders
// "ALWAYS n/a" is structurally incapable of writing anything.
export function oneSafeRule(req, sessionOnly = false) {
  const safe = sanitizeSuggestions(req?.suggestions, req?.toolName, sessionOnly);
  if (safe.length !== 1 || safe[0].rules.length !== 1) return null;
  return safe[0];
}

export function decisionBody(kind, req, opts = {}) {
  if (kind === "allow") return wrap({ behavior: "allow" });
  if (kind === "deny") return wrap({ behavior: "deny", message: DENY_MESSAGE });
  if (kind !== "always") return null;
  const entry = oneSafeRule(req, !!opts.sessionOnly);
  // No single safe rule => no decision at all. A bare allow here would silently turn
  // ALWAYS into ALLOW, and passing the whole `safe` array through would let a key that
  // rendered "ALWAYS n/a" persist several rules.
  if (!entry) return null;
  return wrap({ behavior: "allow", updatedPermissions: [entry] });
}
