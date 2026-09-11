import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHarness, migrate, application, project, post, admin, ORIGIN } from "./harness.mjs";
import worker from "../index.js";
import { readJSON } from "../validation.js";

let app;
before(async () => { app = await createHarness({ DAILY_SUBMISSION_CAP:"4", DAILY_ATTEMPT_CAP:"20", IP_WINDOW_LIMIT:"8" }); });
beforeEach(async () => {
  await app.db.batch([app.db.prepare("DELETE FROM submission_audit"), app.db.prepare("DELETE FROM submissions"), app.db.prepare("DELETE FROM rate_buckets")]);
});
after(async () => { if (app) await app.close(); });

async function count(table) { return (await app.db.prepare(`SELECT count(*) AS n FROM ${table}`).first()).n; }
async function accepted(data = application(), endpoint = "applications", key) {
  const response = await app.fetch(`/api/v1/${endpoint}`, post(data, key));
  assert.equal(response.status, 201, await response.clone().text());
  return response.json();
}

test("catalog has complete free lessons and no invented paid access", async () => {
  const response = await app.fetch("/api/v1/catalog");
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.deepEqual(data.payments, { enabled:false });
  assert.deepEqual(data.training, { status:"applications-open" });
  assert.equal(data.courses[0].lessons.length, 3);
  assert.ok(data.courses.every(course => course.lessons.every(lesson => lesson.id && lesson.title && lesson.body.length >= 4 && lesson.body.every(part => typeof part === "string"))));
});

test("health verifies real D1 schema and does not expose secret material", async () => {
  const response = await app.fetch("/api/health");
  assert.equal(response.status, 200);
  assert.equal((await response.json()).submissions, "ready");
  const broken = await createHarness({ SECURITY_SALT:"" });
  try { assert.equal((await broken.fetch("/api/health")).status, 503); }
  finally { await broken.close(); }
});

test("application is durable, consent-versioned and contains no raw IP", async () => {
  const result = await accepted(application({ phone:"+234 800 123 4567", website:"" }));
  assert.equal(result.accepted, true);
  const row = await app.db.prepare("SELECT * FROM submissions WHERE id = ?").bind(result.id).first();
  assert.equal(row.status, "new");
  assert.equal(row.version, 1);
  assert.ok(row.consent_version && row.consent_at);
  assert.equal(JSON.parse(row.data_json).consent, true);
  assert.equal(Object.hasOwn(JSON.parse(row.data_json), "website"), false);
  assert.ok(!JSON.stringify(await app.db.prepare("SELECT * FROM rate_buckets").all()).includes("192.0.2.10"));
});

test("project request accepts valid date and a plain-text XSS payload safely", async () => {
  const data = project({ targetDate:"2028-02-29", details:'<script>alert("not executed")</script> We need a small project review.' });
  const result = await accepted(data, "project-requests");
  const response = await app.fetch("/api/v1/admin/submissions", { headers:admin() });
  assert.equal(response.status, 200);
  const item = (await response.json()).items[0];
  assert.equal(item.id, result.id);
  assert.equal(item.data.details, data.details);
});

test("idempotent retry returns the same ID; different payload or endpoint conflicts", async () => {
  const key = crypto.randomUUID();
  const first = await accepted(application(), "applications", key);
  assert.deepEqual(await accepted(application(), "applications", key.toUpperCase()), first);
  const changed = await app.fetch("/api/v1/applications", post(application({ name:"Grace Example" }), key));
  assert.equal(changed.status, 409);
  assert.equal((await app.fetch("/api/v1/project-requests", post(project(), key))).status, 409);
  assert.equal(await count("submissions"), 1);
});

test("canonical values deduplicate reordered keys, trimmed strings and omitted optional blanks", async () => {
  const key = crypto.randomUUID();
  const first = await accepted(application({ email:"ada@EXAMPLE.COM", name:" Ada Example ", phone:"" }), "applications", key);
  const reordered = Object.fromEntries(Object.entries(application()).reverse());
  assert.deepEqual(await accepted(reordered, "applications", key), first);
});

test("concurrent identical requests create exactly one durable row and one accepted quota unit", async () => {
  const key = crypto.randomUUID();
  const requests = Array.from({ length:6 }, () => app.fetch("/api/v1/applications", post(application(), key)));
  const responses = await Promise.all(requests);
  assert.deepEqual(responses.map(response => response.status), [201,201,201,201,201,201]);
  const ids = await Promise.all(responses.map(async response => (await response.json()).id));
  assert.equal(new Set(ids).size, 1);
  assert.equal(await count("submissions"), 1);
  assert.equal((await app.db.prepare("SELECT count FROM rate_buckets WHERE bucket_key LIKE 'accepted:%'").first()).count, 1);
});

test("concurrent different payload with same key yields one acceptance and one conflict", async () => {
  const key = crypto.randomUUID();
  const responses = await Promise.all([app.fetch("/api/v1/applications", post(application(), key)), app.fetch("/api/v1/applications", post(application({ name:"Other Name" }), key))]);
  assert.deepEqual(responses.map(response => response.status).sort(), [201,409]);
  assert.equal(await count("submissions"), 1);
});

test("atomic daily cap cannot be exceeded by concurrent submissions; successful retries still work", async () => {
  const keys = Array.from({ length:7 }, () => crypto.randomUUID());
  const responses = await Promise.all(keys.map((key, i) => app.fetch("/api/v1/applications", post(application({ name:`Learner ${i}` }), key))));
  assert.equal(responses.filter(response => response.status === 201).length, 4);
  assert.equal(responses.filter(response => response.status === 429).length, 3);
  assert.equal(await count("submissions"), 4);
  const acceptedIndex = responses.findIndex(response => response.status === 201);
  assert.equal((await app.fetch("/api/v1/applications", post(application({ name:`Learner ${acceptedIndex}` }), keys[acceptedIndex]))).status, 201);
  assert.ok(Number(responses.find(response => response.status === 429).headers.get("retry-after")) > 0);
});

test("per-IP rate bucket fails closed with Retry-After", async () => {
  for (let i = 0; i < 8; i++) await app.fetch("/api/v1/applications", post(application()));
  const response = await app.fetch("/api/v1/applications", post(application()));
  assert.equal(response.status, 429);
  assert.match((await response.json()).error, /Too many/);
  assert.ok(Number(response.headers.get("retry-after")) > 0);
});

test("daily attempt cap bounds creation of hashed-IP rate records", async () => {
  for (let i = 0; i < 20; i++) await app.fetch("/api/v1/applications", post(application(), undefined, { "CF-Connecting-IP":`192.0.2.${i + 1}` }));
  const response = await app.fetch("/api/v1/applications", post(application(), undefined, { "CF-Connecting-IP":"192.0.2.100" }));
  assert.equal(response.status, 429);
  assert.match((await response.json()).error, /Today's request limit/);
  assert.equal((await app.db.prepare("SELECT count(*) AS n FROM rate_buckets WHERE bucket_key LIKE 'ip:%'").first()).n, 20);
});

test("origin, CSRF and CORS are fail-closed", async () => {
  for (const origin of ["https://evil.example", "null", "https://learnatbillioncodes.com.evil.example", "https://learnatbillioncodes.com/"]) {
    const response = await app.fetch("/api/v1/applications", post(application(), undefined, { Origin:origin }));
    assert.equal(response.status, 403);
    assert.equal(response.headers.get("access-control-allow-origin"), null);
  }
  const noOrigin = post(application());
  delete noOrigin.headers.Origin;
  assert.equal((await app.fetch("/api/v1/applications", noOrigin)).status, 403);
  assert.equal((await app.fetch("/api/v1/applications", post(application(), undefined, { "Sec-Fetch-Site":"cross-site" }))).status, 403);
  const alias = await app.fetch("/api/v1/applications", post(application(), undefined, { Origin:"https://www.learnatbillioncodes.com" }));
  assert.equal(alias.status, 201);
  assert.equal(alias.headers.get("access-control-allow-origin"), "https://www.learnatbillioncodes.com");
});

test("preflight allows only declared origins, methods and headers", async () => {
  const response = await app.fetch("/api/v1/applications", { method:"OPTIONS", headers:{ Origin:ORIGIN, "Access-Control-Request-Method":"POST", "Access-Control-Request-Headers":"Content-Type, Idempotency-Key" } });
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("access-control-allow-origin"), ORIGIN);
  assert.equal(response.headers.get("access-control-allow-credentials"), null);
  assert.equal((await app.fetch("/api/v1/applications", { method:"OPTIONS", headers:{ Origin:ORIGIN, "Access-Control-Request-Method":"DELETE" } })).status, 405);
  assert.equal((await app.fetch("/api/v1/applications", { method:"OPTIONS", headers:{ Origin:ORIGIN, "Access-Control-Request-Method":"POST", "Access-Control-Request-Headers":"X-Unknown" } })).status, 403);
});

test("bounded UTF-8 parser rejects oversized, malformed and non-JSON input", async () => {
  const valid = post(application());
  for (const [body, expected, extra] of [
    ["x".repeat(16385), 413, {}],
    ["{", 400, {}],
    ["[]", 400, {}],
    ["null", 400, {}],
    [new Uint8Array([0x7b,0x22,0xc3,0x28]), 400, {}],
    ["{}", 415, { "Content-Type":"text/plain" }],
    ["{}", 415, { "Content-Encoding":"gzip" }]
  ]) {
    const response = await app.fetch("/api/v1/applications", { ...valid, headers:{ ...valid.headers, ...extra }, body });
    assert.equal(response.status, expected, await response.clone().text());
  }
  assert.equal(await count("submissions"), 0);
});

test("strict validation enforces bounds, enums, unknown keys, consent and honeypot", async () => {
  const cases = [
    { name:"A" }, { name:"A".repeat(101) }, { name:42 }, { email:"bad" }, { email:"a..b@example.com" },
    { email:"a@example" }, { phone:"letters" }, { track:"x" }, { format:"remote" }, { experience:"x" },
    { goals:"too short" }, { goals:"x".repeat(2001) }, { consent:false }, { consent:"true" },
    { website:"https://spam.example" }, { admin:true }, { name:"bad\u0000name" }, { name:"bad\ud800name" }, { name:"Ada\nExample" }
  ];
  for (const invalid of cases) {
    const response = await app.fetch("/api/v1/applications", post(application(invalid)));
    assert.equal(response.status, 422, JSON.stringify(invalid));
    assert.ok((await response.json()).fields);
  }
  assert.equal(await count("submissions"), 0);
});

test("Unicode code point bounds accept astral characters without counting bytes as characters", async () => {
  const response = await app.fetch("/api/v1/applications", post(application({ name:"\u{1F680}".repeat(100), experience:"Line one\nLine two\tTabbed", goals:"\u{1F680}".repeat(20) })));
  assert.equal(response.status, 201, await response.clone().text());
});

test("project validation rejects impossible dates and unsupported categories", async () => {
  for (const invalid of [{ targetDate:"2027-02-29" }, { targetDate:"2026-04-31" }, { targetDate:"2026-13-01" }, { targetDate:"2025-12-31" }, { category:"do-my-exam" }, { details:"Too short" }, { summary:"Short" }]) {
    assert.equal((await app.fetch("/api/v1/project-requests", post(project(invalid)))).status, 422);
  }
});

test("private endpoints require header token and never offer public lookup", async () => {
  const result = await accepted();
  assert.equal((await app.fetch("/api/v1/admin/submissions")).status, 401);
  assert.equal((await app.fetch("/api/v1/admin/submissions", { headers:{ Authorization:"Bearer " + "x".repeat(40) } })).status, 401);
  assert.equal((await app.fetch("/api/v1/admin/submissions?token=secret")).status, 400);
  assert.equal((await app.fetch("/api/v1/applications/" + result.id)).status, 404);
  assert.equal((await app.fetch("/api/v1/project-requests/" + result.id)).status, 404);
  assert.equal((await app.fetch("/api/v1/applications")).status, 405);
  assert.equal((await app.fetch("/api/v1/admin/submissions", { headers:admin({ Origin:"https://evil.example" }) })).status, 403);
});

test("review updates are optimistic and trigger an atomic audit; no-op does not add audit", async () => {
  const result = await accepted();
  const update = data => app.fetch("/api/v1/admin/submissions/" + result.id, { method:"PATCH", headers:admin({ "Content-Type":"application/json" }), body:JSON.stringify(data) });
  assert.equal((await update({ status:"contacted", version:1 })).status, 200);
  assert.equal((await update({ status:"closed", version:1 })).status, 409);
  assert.equal((await update({ status:"contacted", version:2 })).status, 200);
  assert.equal((await update({ status:"closed", version:2 })).status, 200);
  assert.equal((await update({ status:"paid", version:3 })).status, 422);
  const audit = await app.fetch(`/api/v1/admin/submissions/${result.id}/audit`, { headers:admin() });
  assert.equal(audit.status, 200);
  const items = (await audit.json()).items;
  assert.equal(items.length, 2);
  assert.deepEqual(items.map(item => item.status), ["closed", "contacted"]);
  assert.ok(items.every(item => item.actor === "admin" && !JSON.stringify(item).includes("example.com")));
});

test("simultaneous review updates reject stale revision without losing audit", async () => {
  const result = await accepted();
  const responses = await Promise.all(["contacted", "closed"].map(status => app.fetch(`/api/v1/admin/submissions/${result.id}`, { method:"PATCH", headers:admin({ "Content-Type":"application/json" }), body:JSON.stringify({ status, version:1 }) })));
  assert.deepEqual(responses.map(response => response.status).sort(), [200,409]);
  assert.equal(await count("submission_audit"), 1);
});

test("private pagination is bounded, filterable and cursor-based", async () => {
  await accepted();
  await accepted(application({ name:"Grace Example" }));
  await accepted(project(), "project-requests");
  const first = await (await app.fetch("/api/v1/admin/submissions?limit=1&kind=applications", { headers:admin() })).json();
  assert.equal(first.items.length, 1);
  assert.ok(first.nextCursor);
  const second = await (await app.fetch("/api/v1/admin/submissions?limit=1&kind=applications&cursor=" + first.nextCursor, { headers:admin() })).json();
  assert.equal(second.items.length, 1);
  assert.notEqual(first.items[0].id, second.items[0].id);
  assert.equal(second.nextCursor, null);
  for (const query of ["limit=100", "limit=1.1", "kind=no", "status=paid", "cursor=garbage", "unknown=yes", "limit=1&limit=2"]) {
    assert.equal((await app.fetch("/api/v1/admin/submissions?" + query, { headers:admin() })).status, 400);
  }
});

test("payment and reward endpoints explicitly return 503 rather than fake enrolment", async () => {
  for (const path of ["payments", "payments/checkout", "checkout", "enrolments", "enrollments", "referrals/credits", "rewards"]) {
    const response = await app.fetch("/api/v1/" + path, { method:"POST" });
    assert.equal(response.status, 503);
    assert.match((await response.json()).error, /not configured/);
  }
});

test("API responses and admin shell have no-store and defensive headers", async () => {
  for (const path of ["/api/v1/catalog", "/api/health", "/api/v1/not-a-route", "/admin", "/admin.html"]) {
    const response = await app.fetch(path);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("x-frame-options"), "DENY");
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.match(response.headers.get("x-robots-tag"), /noindex/);
    if (path.startsWith("/admin")) {
      const text = await response.text();
      assert.equal(response.status, 200);
      assert.ok(!text.includes("__CSP_NONCE__"));
      assert.match(response.headers.get("content-security-policy"), /script-src 'nonce-/);
      assert.doesNotMatch(text, /localStorage|sessionStorage|innerHTML|document\.write/);
    }
  }
  assert.equal((await app.fetch("/admin?token=no")).status, 400);
});

test("additive migration can be reapplied without deleting submissions", async () => {
  await accepted();
  await migrate(app.db);
  assert.equal(await count("submissions"), 1);
});

test("expired rate buckets are removed opportunistically with writes", async () => {
  await app.db.prepare("INSERT INTO rate_buckets VALUES ('expired-test', 1, 1)").run();
  await accepted();
  assert.equal(await app.db.prepare("SELECT * FROM rate_buckets WHERE bucket_key='expired-test'").first(), null);
});

test("machine contract parses and has all fixed endpoints", async () => {
  const contract = JSON.parse(await readFile(new URL("../../api-contract.json", import.meta.url), "utf8"));
  assert.equal(contract.version, "1.0.0");
  assert.equal(contract.requestRules.maxBodyBytes, 16384);
  assert.ok(contract.endpoints["GET /api/v1/catalog"]);
  assert.equal(contract.endpoints["POST /api/v1/applications"].status, 201);
});

test("streamed bodies without Content-Length are cancelled at the byte cap", async () => {
  let cancelled = false;
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(8192));
      controller.enqueue(new Uint8Array(8193));
    },
    cancel() { cancelled = true; }
  });
  const request = new Request(ORIGIN + "/api/v1/applications", { method:"POST", headers:{ "Content-Type":"application/json" }, body:stream, duplex:"half" });
  await assert.rejects(() => readJSON(request), error => error.status === 413);
  assert.equal(cancelled, true);
});

test("missing secrets fail closed without accepting a submission or exposing a private list", async () => {
  const broken = await createHarness({ SECURITY_SALT:"", ADMIN_TOKEN:"" });
  try {
    assert.equal((await broken.fetch("/api/v1/applications", post(application()))).status, 503);
    assert.equal((await broken.db.prepare("SELECT count(*) AS n FROM submissions").first()).n, 0);
    assert.equal((await broken.fetch("/api/v1/admin/submissions", { headers:admin() })).status, 503);
    assert.equal((await broken.fetch("/api/v1/catalog")).status, 200);
  } finally { await broken.close(); }
});

test("D1 failure is an honest generic 503 without leaking SQL, private input or internal error", async () => {
  const env = { SECURITY_SALT:"local-testing-salt-not-production-123456", DB:{ prepare() { throw new Error("SQL failed with secret_person@example.com and hidden-token"); } } };
  const response = await worker.fetch(new Request(ORIGIN + "/api/v1/applications", post(application())), env);
  assert.equal(response.status, 503);
  const text = await response.text();
  assert.ok(!text.includes("secret_person") && !text.includes("hidden-token") && !text.includes("SQL failed"));
  assert.match(text, /same Idempotency-Key/);
});

test("opportunistic cleanup removes no more than 1000 expired buckets per write", async () => {
  await app.db.prepare("WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<1002) INSERT INTO rate_buckets SELECT 'expired-' || x, 1, 1 FROM n").run();
  await accepted();
  assert.equal((await app.db.prepare("SELECT count(*) AS n FROM rate_buckets WHERE expires_at=1").first()).n, 2);
});
