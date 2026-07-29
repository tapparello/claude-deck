// Correctness-only lint. Deliberately not a style tool: the source is densely and
// intentionally formatted (aligned single-line switch arms, packed const lines),
// and a formatter would rewrite all ~5000 lines and take git blame with it.
//
// The rules here are the ones that catch bugs this codebase has actually had — an
// unused binding left behind by a refactor, and a branch that could never run
// because it compared a value against itself (see the "this was dead code" note in
// ensureHookServerOnce).
export default [
  {
    files: ["**/*.js", "**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: {
        // Node
        process: "readonly", console: "readonly", Buffer: "readonly",
        setTimeout: "readonly", clearTimeout: "readonly",
        setInterval: "readonly", clearInterval: "readonly",
        URL: "readonly", TextEncoder: "readonly", TextDecoder: "readonly",
        fetch: "readonly", AbortController: "readonly",
      },
    },
    linterOptions: { reportUnusedDisableDirectives: true },
    rules: {
      // A reference to something that does not exist. This is the one that would
      // have caught the moved-helper call sites during the view.js extraction.
      "no-undef": "error",
      // Leftovers from a refactor. Args are exempt: several platform-adapter
      // methods take a parameter only to match the other platform's signature
      // (winPlatform.fireHotkey ignores its hotkey), and that is intentional.
      "no-unused-vars": ["error", { args: "none", caughtErrors: "none" }],
      // Branches that cannot run, and comparisons that are always true/false.
      "no-constant-condition": ["error", { checkLoops: false }],
      "no-self-compare": "error",
      "no-dupe-keys": "error",
      "no-dupe-else-if": "error",
      "no-duplicate-case": "error",
      "no-unreachable": "error",
      // Silent data loss / accidents.
      "no-fallthrough": "error",
      "no-sparse-arrays": "error",
      "require-atomic-updates": "off", // too noisy against the poller pattern
      // An empty catch is a deliberate idiom throughout (best-effort file reads),
      // so allow it, but not an empty block anywhere else.
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
  {
    // The bundle is generated; never lint it.
    ignores: ["dev.tapparello.agent-vitals.sdPlugin/bin/**", "node_modules/**"],
  },
];
