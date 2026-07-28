// Loopback listener for Claude Code's `PermissionRequest` http hook.
// Knows nothing about the deck: it routes, authenticates, and hands each request
// to onRequest as a ticket whose `respond` is idempotent.
import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";

export const BODY_MAX = 1024 * 1024;
// A single stray 404 (any web page can trigger one with a no-cors POST to the port)
// must not permanently replace the idle face with "auth?" - only REPEATED bad-path
// hits are evidence of a stale/mis-pasted URL. Windowed rather than cumulative.
export const BADPATH_WINDOW_MS = 5 * 60_000;
export const BADPATH_MIN_HITS = 3;

const sameSecret = (a, b) => {
  const A = Buffer.from(String(a)), B = Buffer.from(String(b));
  return A.length === B.length && timingSafeEqual(A, B);
};

export function startHookServer({ port, secret, onRequest, onDrop, log = () => {}, retries = 3, retryMs = 500 }) {
  if (!secret || String(secret).length < 32) {
    return Promise.reject(new Error("hook secret too short"));
  }
  const wantPath = `/permission/${secret}`;
  // badPathHits: timestamps of recent wrong-path requests, pruned to BADPATH_WINDOW_MS
  // on every hit. The caller (src/plugin.js) re-filters by the window at READ time too,
  // so the signal decays even if no further bad requests ever arrive to prune it.
  const stats = { badPathHits: [] };
  let boundPort = null;

  const server = createServer((req, res) => {
    const deny = (code) => { res.writeHead(code).end(); };
    // Path is the credential. Exact match only - no query, no trailing segment.
    if (!sameSecret(req.url ?? "", wantPath)) {
      const now = Date.now();
      stats.badPathHits.push(now);
      stats.badPathHits = stats.badPathHits.filter((t) => now - t < BADPATH_WINDOW_MS);
      return deny(404);
    }
    // A request with the right secret path proves the pasted URL IS correct, so any
    // earlier bad-path hits (typo, stale copy, stray probe) are no longer evidence of
    // anything - clear the signal rather than let it linger until the window lapses.
    if (stats.badPathHits.length) stats.badPathHits = [];
    const host = String(req.headers.host ?? "");
    if (host !== `127.0.0.1:${boundPort}` && host !== `localhost:${boundPort}`) return deny(403);
    if (req.method !== "POST") return deny(405);

    // setEncoding matters: concatenating raw Buffers as strings corrupts any
    // multi-byte character split across chunks, and a Write tool_input is an entire
    // file, i.e. reliably multi-chunk.
    req.setEncoding("utf8");
    let body = "", over = false;
    req.on("data", (c) => {
      if (over) return;
      body += c;
      if (body.length > BODY_MAX) {
        over = true;
        // Let the response flush before dropping the socket, or the client sees
        // ECONNRESET instead of 413 on a slow runner.
        res.writeHead(413);
        res.end();
        res.on("finish", () => req.destroy());
      }
    });
    req.on("end", () => {
      if (over) return;
      let payload;
      try { payload = JSON.parse(body || "{}"); } catch { return deny(400); }

      const ticket = {
        id: null,
        closed: false,
        respond(out) {
          if (ticket.closed || res.writableEnded) return false;
          ticket.closed = true;
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify(out ?? {}));
          return true;
        },
      };
      // `close` also fires on the happy path, so discriminate on writableEnded.
      res.on("close", () => {
        if (res.writableEnded || ticket.closed) return;
        ticket.closed = true;
        onDrop?.(ticket);
      });
      try { onRequest(payload, ticket); } catch (e) {
        log("hook onRequest threw:", String(e));
        ticket.respond(null);
      }
    });
    req.on("error", () => {});
  });

  return new Promise((resolve, reject) => {
    let left = retries;
    const attempt = () => {
      server.once("error", (e) => {
        if (e.code === "EADDRINUSE" && left-- > 0) {
          log(`hook port ${port} busy, retrying (${left} left)`);
          setTimeout(attempt, retryMs);
          return;
        }
        reject(e);
      });
      server.listen(port, "127.0.0.1", () => {
        boundPort = server.address().port;
        // Drop the per-attempt reject listener, then keep a permanent logger: a later
        // runtime error must not call reject() on an already-settled promise.
        server.removeAllListeners("error");
        server.on("error", (err) => log("hook server error:", String(err)));
        log(`hook server on http://127.0.0.1:${boundPort}/permission/<secret>`);
        resolve({
          boundPort,
          // The secret this server actually bound to, so a caller can tell a genuine
          // secret CHANGE (which needs a rebind) apart from a same-secret re-assert
          // (which doesn't) instead of comparing boundPort alone.
          secret,
          stats,
          close: () => new Promise((done) => {
            let settled = false;
            const finish = () => { if (!settled) { settled = true; done(); } };
            server.close(finish);
            server.closeIdleConnections();
            // A held request keeps its socket non-idle, so bound the wait. Unref'd so
            // this timer can never by itself hold the event loop open.
            setTimeout(() => { server.closeAllConnections?.(); finish(); }, 250).unref();
          }),
        });
      });
    };
    attempt();
  });
}
