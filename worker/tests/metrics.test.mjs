import test from "node:test";
import assert from "node:assert/strict";
import { ORIGIN, admin, createHarness } from "./harness.mjs";

const send = (h, body, ip = "192.0.2.30", headers = {}) => h.fetch("/api/v1/metrics", { method: "POST", headers: { "Content-Type": "application/json", Origin: ORIGIN, "CF-Connecting-IP": ip, ...headers }, body: JSON.stringify(body) });

test("learning events become anonymous daily counters and appear in the staff funnel", async t => {
  const h = await createHarness(); t.after(() => h.close());
  for (const body of [{ event: "home_view" }, { event: "home_view" }, { event: "start_path", subject: "practice" }, { event: "lesson_view", subject: "first-web-page:structure-before-style" }, { event: "practice_pass", subject: "profile-card" }, { event: "game_play" }])
    assert.equal((await send(h, body)).status, 204);

  const rows = (await h.db.prepare("SELECT * FROM learning_metrics ORDER BY event, subject").all()).results;
  assert.deepEqual(Object.keys(rows[0]).sort(), ["count", "day", "event", "subject"], "only aggregates are stored");
  assert.ok(!JSON.stringify(rows).includes("192.0.2"), "no addresses are stored");
  assert.equal(rows.find(row => row.event === "home_view").count, 2);

  assert.equal((await h.fetch("/api/v1/admin/metrics")).status, 401);
  const report = await (await h.fetch("/api/v1/admin/metrics?days=7", { headers: admin() })).json();
  assert.equal(report.days, 7);
  assert.equal(report.funnel[0].event, "home_view"); assert.equal(report.funnel[0].count, 2);
  assert.equal(report.funnel.find(step => step.event === "practice_pass").count, 1);
  assert.deepEqual(report.subjects.start_path, { practice: 1 });
  assert.equal(report.extra[0].count, 1, "the game is reported separately from the learning funnel");
  assert.equal(report.daily.length, 1);
  assert.equal((await h.fetch("/api/v1/admin/metrics?days=365", { headers: admin() })).status, 400);
});

test("only known events with safe subjects from the site are accepted, and senders are rate limited", async t => {
  const h = await createHarness(); t.after(() => h.close());
  for (const bad of [{ event: "page_view" }, { event: "lesson_view", subject: "Ada Lovelace" }, { event: "lesson_view", subject: "a@b.com" }, { event: "home_view", email: "ada@example.com" }, { event: "lesson_view", subject: "x".repeat(200) }, []])
    assert.equal((await send(h, bad)).status, 400, JSON.stringify(bad));
  assert.equal((await h.fetch("/api/v1/metrics", { method: "POST", headers: { "Content-Type": "application/json" }, body: '{"event":"home_view"}' })).status, 403, "origin required");
  assert.equal((await send(h, { event: "home_view" }, "192.0.2.31", { Origin: "https://evil.example" })).status, 403);
  for (let i = 0; i < 150; i++) assert.equal((await send(h, { event: "home_view" }, "198.51.100.9")).status, 204);
  assert.equal((await send(h, { event: "home_view" }, "198.51.100.9")).status, 429);
  const row = await h.db.prepare("SELECT count FROM learning_metrics WHERE event = 'home_view'").first();
  assert.equal(row.count, 150, "limited requests are not counted");
});
