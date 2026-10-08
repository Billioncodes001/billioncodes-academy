import test from "node:test";
import assert from "node:assert/strict";
import { ORIGIN, admin, createHarness } from "./harness.mjs";
import { maxScoreThrough, minSecondsToReach, validateName } from "../arcade.js";

const send = (body, ip = "192.0.2.20", extra = {}) => ({ method: "POST", headers: { "Content-Type": "application/json", Origin: ORIGIN, "CF-Connecting-IP": ip, ...extra }, body: JSON.stringify(body) });
const start = async (h, ip) => { const response = await h.fetch("/api/v1/arcade/runs", { method: "POST", headers: { Origin: ORIGIN, "CF-Connecting-IP": ip || "192.0.2.20" } }); assert.equal(response.status, 201, await response.clone().text()); return (await response.json()).runId; };
// Pretend the run began earlier, so a longer game is plausible.
const age = (h, runId, seconds) => h.db.prepare("UPDATE arcade_runs SET started_at = started_at - ? WHERE id = ?").bind(seconds, runId).run();
const submit = (h, body, ip) => h.fetch("/api/v1/arcade/scores", send(body, ip));

test("plausibility bounds follow the game's rules", () => {
  assert.equal(maxScoreThrough(1), 6 * 80);
  assert.equal(maxScoreThrough(3), (6 + 8) * 80 + 10 * 80 + 800);
  assert.equal(minSecondsToReach(1), 0);
  assert.ok(minSecondsToReach(5) > 10 && minSecondsToReach(5) < 30);
  assert.equal(validateName("  Ada   Lovelace "), "Ada Lovelace");
  for (const bad of ["a", "this name is far too long", "<script>", "___", "f.u.c.k", 42]) assert.throws(() => validateName(bad));
});

test("a played game can be submitted once, ranks, and appears on the leaderboard", async t => {
  const h = await createHarness(); t.after(() => h.close());
  const first = await start(h);
  let response = await submit(h, { runId: first, name: "Ada", score: 120, wave: 1 });
  assert.equal(response.status, 201, await response.clone().text());
  let body = await response.json();
  assert.equal(body.entry.rank, 1); assert.equal(body.entry.name, "Ada");

  const second = await start(h);
  await age(h, second, 120);
  body = await (await submit(h, { runId: second, name: "Grace", score: 900, wave: 3 })).json();
  assert.equal(body.entry.rank, 1);
  assert.deepEqual(body.top.map(item => [item.rank, item.name, item.score]), [[1, "Grace", 900], [2, "Ada", 120]]);

  assert.equal((await submit(h, { runId: first, name: "Ada", score: 130, wave: 1 })).status, 409, "a run counts once");
  const board = await (await h.fetch("/api/v1/arcade/leaderboard?period=week", { headers: { Origin: ORIGIN } })).json();
  assert.equal(board.entries.length, 2);
  assert.equal(board.entries[0].name, "Grace");
  assert.equal((await h.fetch("/api/v1/arcade/leaderboard?period=year")).status, 400);
});

test("impossible, too-fast, unknown and malformed submissions are rejected", async t => {
  const h = await createHarness(); t.after(() => h.close());
  const run = await start(h);
  assert.equal((await submit(h, { runId: run, name: "Cheat", score: maxScoreThrough(1) + 10, wave: 1 })).status, 422, "more points than wave 1 allows");
  assert.equal((await submit(h, { runId: run, name: "Cheat", score: 15, wave: 1 })).status, 422, "scores move in steps of ten");
  assert.equal((await submit(h, { runId: run, name: "Speedy", score: 500, wave: 9 })).status, 422, "wave 9 cannot be reached instantly");
  assert.equal((await submit(h, { runId: crypto.randomUUID(), name: "Ghost", score: 10, wave: 1 })).status, 404);
  assert.equal((await submit(h, { runId: run, name: "x", score: 10, wave: 1 })).status, 400);
  assert.equal((await submit(h, { runId: run, name: "Ada", score: 10, wave: 1, admin: true })).status, 400, "unknown fields");
  assert.equal((await submit(h, { runId: run, name: "Ada", score: -10, wave: 1 })).status, 400);
  // The rejected attempts did not consume the run.
  assert.equal((await submit(h, { runId: run, name: "Honest", score: 40, wave: 1 })).status, 201);
});

test("writes need the site's origin and runs are rate limited per connection", async t => {
  const h = await createHarness(); t.after(() => h.close());
  assert.equal((await h.fetch("/api/v1/arcade/runs", { method: "POST" })).status, 403);
  assert.equal((await h.fetch("/api/v1/arcade/runs", { method: "POST", headers: { Origin: "https://evil.example" } })).status, 403);
  for (let i = 0; i < 40; i++) await start(h, "198.51.100.7");
  const limited = await h.fetch("/api/v1/arcade/runs", { method: "POST", headers: { Origin: ORIGIN, "CF-Connecting-IP": "198.51.100.7" } });
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get("retry-after")) > 0);
  await start(h, "198.51.100.8");
  const stored = await h.db.prepare("SELECT ip_hash FROM arcade_runs LIMIT 1").first();
  assert.ok(!stored.ip_hash.includes("198.51"), "raw addresses are never stored");
});

test("staff can hide, restore and delete entries; the public cannot", async t => {
  const h = await createHarness(); t.after(() => h.close());
  const run = await start(h);
  const { entry } = await (await submit(h, { runId: run, name: "Rude Name", score: 50, wave: 1 })).json();
  assert.equal((await h.fetch("/api/v1/admin/arcade")).status, 401);
  const list = await (await h.fetch("/api/v1/admin/arcade", { headers: admin() })).json();
  assert.equal(list.entries[0].id, entry.id);

  const patch = hidden => h.fetch(`/api/v1/admin/arcade/${entry.id}`, { method: "PATCH", headers: admin({ "Content-Type": "application/json" }), body: JSON.stringify({ hidden }) });
  assert.equal((await patch(true)).status, 200);
  assert.equal((await (await h.fetch("/api/v1/arcade/leaderboard")).json()).entries.length, 0, "hidden entries leave the public board");
  assert.equal((await patch(false)).status, 200);
  assert.equal((await (await h.fetch("/api/v1/arcade/leaderboard")).json()).entries.length, 1);

  assert.equal((await h.fetch(`/api/v1/admin/arcade/${entry.id}`, { method: "DELETE", headers: admin() })).status, 200);
  assert.equal((await h.fetch(`/api/v1/admin/arcade/${entry.id}`, { method: "DELETE", headers: admin() })).status, 404);
  assert.equal((await (await h.fetch("/api/v1/arcade/leaderboard")).json()).entries.length, 0);
});

test("challenge links show a rich preview for visible entries and fall back safely", async t => {
  const h = await createHarness(); t.after(() => h.close());
  const run = await start(h);
  const { entry } = await (await submit(h, { runId: run, name: "Ada", score: 470, wave: 1 })).json();

  const lookup = await (await h.fetch(`/api/v1/arcade/entries/${entry.id}`)).json();
  assert.deepEqual([lookup.entry.name, lookup.entry.score, lookup.entry.rank], ["Ada", 470, 1]);
  assert.equal((await h.fetch(`/api/v1/arcade/entries/${crypto.randomUUID()}`)).status, 404);
  assert.equal((await h.fetch("/api/v1/arcade/entries/not-a-uuid")).status, 404);

  const page = await h.fetch(`/c/${entry.id}`);
  assert.equal(page.status, 200);
  assert.match(page.headers.get("content-type"), /text\/html/);
  assert.match(page.headers.get("content-security-policy"), /default-src 'none'/);
  const html = await page.text();
  assert.match(html, /<meta property="og:title" content="Ada scored 470 in Debug Defender\. Can you beat it\?">/);
  assert.match(html, /og:image" content="https:\/\/learnatbillioncodes\.com\/brand\/debug-defender-share-v1\.jpg"/);
  assert.match(html, /twitter:card" content="summary_large_image"/);
  assert.match(html, new RegExp(`url=/\\?challenge=${entry.id}`));
  assert.doesNotMatch(html, /<script/i);

  // Hostile text can only arrive by bypassing validation; it must still be escaped.
  await h.db.prepare("UPDATE arcade_scores SET name = ? WHERE id = ?").bind('"><script>x', entry.id).run();
  const escaped = await (await h.fetch(`/c/${entry.id}`)).text();
  assert.doesNotMatch(escaped, /<script>x/);
  assert.match(escaped, /&quot;&gt;&lt;script&gt;/);

  await h.db.prepare("UPDATE arcade_scores SET hidden = 1 WHERE id = ?").bind(entry.id).run();
  const hidden = await (await h.fetch(`/c/${entry.id}`)).text();
  assert.match(hidden, /Debug Defender: can you stop the bugs\?/, "hidden names never appear in previews");
  assert.doesNotMatch(hidden, /&lt;script|Ada/);
  assert.equal((await h.fetch(`/api/v1/arcade/entries/${entry.id}`)).status, 404);
  assert.equal((await h.fetch("/c/whatever")).status, 200);
});
