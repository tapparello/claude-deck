import { test } from "node:test";
import assert from "node:assert/strict";
import { request as httpRequest } from "node:http";
import { startHookServer, BODY_MAX } from "../src/hookserver.js";

const SECRET = "s".repeat(32);
const boot = async (over = {}) => {
  const seen = [];
  const dropped = [];
  const h = await startHookServer({
    port: 0, secret: SECRET,
    onRequest: (payload, ticket) => seen.push({ payload, ticket }),
    onDrop: (ticket) => dropped.push(ticket),
    ...over,
  });
  return { h, seen, dropped, url: (p = `/permission/${SECRET}`) => `http://127.0.0.1:${h.boundPort}${p}` };
};
const post = (url, body, init = {}) =>
  fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), ...init });

test("a valid POST is held open until respond() is called", { timeout: 5000 }, async () => {
  const { h, seen, url } = await boot();
  const p = post(url(), { hook_event_name: "PermissionRequest", tool_name: "Bash" });
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(seen.length, 1);
  assert.equal(seen[0].payload.tool_name, "Bash");
  seen[0].ticket.respond({ ok: true });
  const res = await p;
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
  await h.close();
});

test("respond(null) sends an empty-object pass", { timeout: 5000 }, async () => {
  const { h, seen, url } = await boot();
  const p = post(url(), { tool_name: "Bash" });
  await new Promise((r) => setTimeout(r, 50));
  seen[0].ticket.respond(null);
  assert.deepEqual(await (await p).json(), {});
  await h.close();
});

test("a SECOND respond() is a no-op and does not throw", { timeout: 5000 }, async () => {
  // A double-resolve would throw ERR_HTTP_HEADERS_SENT synchronously, and
  // onKeyDown runs bare off the websocket handler - it would kill the plugin.
  const { h, seen, url } = await boot();
  const p = post(url(), { tool_name: "Bash" });
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(seen[0].ticket.respond({ first: true }), true);
  assert.doesNotThrow(() => assert.equal(seen[0].ticket.respond({ second: true }), false));
  assert.deepEqual(await (await p).json(), { first: true });
  await h.close();
});

test("wrong secret in the path is 404 and never reaches onRequest", { timeout: 5000 }, async () => {
  const { h, seen, url } = await boot();
  const res = await post(url(`/permission/${"x".repeat(32)}`), { tool_name: "Bash" });
  assert.equal(res.status, 404);
  assert.equal(seen.length, 0);
  await h.close();
});

test("bare path, wrong prefix, and trailing junk are all 404", { timeout: 5000 }, async () => {
  const { h, url } = await boot();
  for (const p of ["/", "/permission", `/permission/${SECRET}/x`, `/other/${SECRET}`, `/permission/${SECRET}?a=1`]) {
    assert.equal((await post(url(p), {})).status, 404, p);
  }
  await h.close();
});

test("non-POST is 405", { timeout: 5000 }, async () => {
  const { h, url } = await boot();
  assert.equal((await fetch(url())).status, 405);
  await h.close();
});

test("malformed JSON is 400", { timeout: 5000 }, async () => {
  const { h, seen, url } = await boot();
  const res = await fetch(url(), { method: "POST", headers: { "content-type": "application/json" }, body: "{nope" });
  assert.equal(res.status, 400);
  assert.equal(seen.length, 0);
  await h.close();
});

test("an oversized body is 413", { timeout: 5000 }, async () => {
  const { h, seen, url } = await boot();
  const res = await fetch(url(), { method: "POST", headers: { "content-type": "application/json" }, body: "x".repeat(BODY_MAX + 10) });
  assert.equal(res.status, 413);
  assert.equal(seen.length, 0);
  await h.close();
});

// `fetch` CANNOT set Host - it is a forbidden header and undici silently overwrites
// it, so a fetch-based version of this test sails through the host check, gets held
// open, and deadlocks the whole suite. Use node:http, which sends what it is told.
test("a foreign Host header is 403", { timeout: 5000 }, async () => {
  const { h, seen, url } = await boot();
  const status = await new Promise((done, fail) => {
    const req = httpRequest(url(), {
      method: "POST", headers: { "content-type": "application/json", host: "evil.example.com" },
    }, (res) => { res.resume(); done(res.statusCode); });
    req.on("error", fail);
    req.end("{}");
  });
  assert.equal(status, 403);
  assert.equal(seen.length, 0);
  await h.close();
});

test("localhost as Host is accepted", { timeout: 5000 }, async () => {
  const { h, seen } = await boot();
  // Do NOT await before responding: the server is holding the request.
  const p = fetch(`http://localhost:${h.boundPort}/permission/${SECRET}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: "{}",
  });
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(seen.length, 1);
  seen[0].ticket.respond(null);
  assert.equal((await p).status, 200);
  await h.close();
});

test("close() resolves even while a request is held open", { timeout: 5000 }, async () => {
  // server.close() waits on non-idle sockets, so without the force-close this hangs
  // and ensureHookServer's `await previous.close()` suspends forever on a port change.
  const { h, seen, url } = await boot();
  post(url(), { tool_name: "Bash" }).catch(() => {});
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(seen.length, 1);
  await h.close();
});

test("stats.badPath counts 404s, which drives the auth? key state", { timeout: 5000 }, async () => {
  const { h, url } = await boot();
  assert.equal(h.stats.badPath, 0);
  await post(url(`/permission/${"x".repeat(32)}`), {});
  await post(url("/nope"), {});
  assert.equal(h.stats.badPath, 2);
  await h.close();
});

test("a client disconnect before a response fires onDrop", { timeout: 5000 }, async () => {
  const { h, seen, dropped, url } = await boot();
  const ac = new AbortController();
  post(url(), { tool_name: "Bash" }, { signal: ac.signal }).catch(() => {});
  await new Promise((r) => setTimeout(r, 50));
  seen[0].ticket.id = 7;
  ac.abort();
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(dropped.length, 1);
  assert.equal(dropped[0].id, 7);
  assert.equal(dropped[0].closed, true);
  await h.close();
});

test("a SUCCESSFUL response does not fire onDrop", { timeout: 5000 }, async () => {
  // res.on('close') fires on the happy path too - the writableEnded discriminator
  const { h, seen, dropped, url } = await boot();
  const p = post(url(), { tool_name: "Bash" });
  await new Promise((r) => setTimeout(r, 50));
  seen[0].ticket.respond({ ok: 1 });
  await p;
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(dropped.length, 0);
  await h.close();
});

test("a short secret is refused outright", { timeout: 5000 }, async () => {
  await assert.rejects(
    () => startHookServer({ port: 0, secret: "tooshort", onRequest() {} }),
    /secret too short/,
  );
  // an empty secret must never mean "accept everything"
  await assert.rejects(() => startHookServer({ port: 0, secret: "", onRequest() {} }), /secret too short/);
});

test("EADDRINUSE rejects after exhausting retries", { timeout: 5000 }, async () => {
  const first = await boot();
  await assert.rejects(
    () => startHookServer({ port: first.h.boundPort, secret: SECRET, onRequest() {}, retries: 1, retryMs: 10 }),
    (e) => e.code === "EADDRINUSE",
  );
  await first.h.close();
});
