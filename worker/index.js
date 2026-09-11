import { catalog } from "./catalog.js";
import { identityRoute, identityReady, platformEnabled } from './identity.js';
import { platformRoute } from './platform.js';
import { HttpError, UUID, readJSON, validateSubmission, validateStatus } from "./validation.js";
import { authenticateAdmin, checkOrigin, configuredSecret, secureHeaders, sha256 } from "./security.js";
import { database, getExisting, createSubmission, limitPublicAttempt, listSubmissions, updateStatus, readAudit } from "./storage.js";

function json(data, status = 200, headers = {}) {
  return Response.json(data, { status, headers });
}

function method(request, allowed) {
  if (!allowed.includes(request.method)) throw new HttpError(405, "Method not allowed.", undefined, { Allow: allowed.join(", ") });
}

function preflight(request, env, path) {
  checkOrigin(request, env, true);
  const methods = path === "/api/v1/applications" || path === "/api/v1/project-requests" ? ["POST"]
    : /^\/api\/v1\/admin\/submissions\/[0-9a-f-]+$/i.test(path) ? ["PATCH"]
    : path === "/api/health" || path === "/api/v1/catalog" || path === "/api/v1/admin/submissions" || /^\/api\/v1\/admin\/submissions\/[0-9a-f-]+\/audit$/i.test(path) ? ["GET"] : [];
  if (!methods.length) throw new HttpError(404, "API endpoint not found.");
  const requested = request.headers.get("access-control-request-method");
  if (!methods.includes(requested)) throw new HttpError(405, "Preflight method not permitted.");
  const allowedHeaders = ["content-type", "idempotency-key", "authorization"];
  const headers = (request.headers.get("access-control-request-headers") || "").split(",").map(value => value.trim().toLowerCase()).filter(Boolean);
  if (headers.some(header => !allowedHeaders.includes(header))) throw new HttpError(403, "Preflight headers not permitted.");
  return new Response(null, { status: 204, headers: { "Access-Control-Allow-Methods": methods.join(", "), "Access-Control-Allow-Headers": allowedHeaders.join(", "), "Access-Control-Max-Age": "600" } });
}

async function api(request, env, url) {
  const path = url.pathname;
  if ([...url.searchParams.keys()].some(key => /^(token|access_token|admin_token|authorization)$/i.test(key))) throw new HttpError(400, "Credentials are permitted only in the Authorization header.");
  if (path.startsWith('/api/auth/')) return identityRoute(request, env, path);
  if (path.startsWith('/api/v2/')) return platformRoute(request, env, url);
  if (request.method === "OPTIONS") return preflight(request, env, path);
  const publicWrite = path === "/api/v1/applications" || path === "/api/v1/project-requests";
  checkOrigin(request, env, publicWrite && request.method === "POST");
  if (path === "/api/v1/catalog") {
    method(request, ["GET"]);
    return json(platformEnabled(env) ? { ...catalog, training: { status: 'account-required' } } : catalog);
  }
  if (path === "/api/health") {
    method(request, ["GET"]);
    try {
      const db = database(env);
      await db.batch([
        db.prepare("SELECT id, consent_version FROM submissions LIMIT 0"),
        db.prepare("SELECT bucket_key FROM rate_buckets LIMIT 0"),
        db.prepare("SELECT id FROM submission_audit LIMIT 0")
      ]);
      if (!configuredSecret(env.SECURITY_SALT)) throw new Error();
      if (platformEnabled(env)) {
        if (!identityReady(env)) throw new Error();
        await db.batch([
          db.prepare('SELECT id,disabled FROM learner_users LIMIT 0'),
          db.prepare('SELECT user_id FROM learner_profiles LIMIT 0'),
          db.prepare('SELECT id FROM learning_courses LIMIT 0'),
          db.prepare('SELECT user_id FROM learning_enrolments LIMIT 0'),
          db.prepare('SELECT id FROM training_cohorts LIMIT 0'),
          db.prepare('SELECT id FROM training_applications LIMIT 0')
        ]);
      }
      return json({ ok: true, service: "billioncodes-academy", apiVersion: "v1", submissions: "ready", payments: "unconfigured" });
    } catch {
      return json({ ok: false, error: "Submission service is not ready.", service: "billioncodes-academy", apiVersion: "v1", submissions: "unavailable", payments: "unconfigured" }, 503);
    }
  }
  if (/^\/api\/v1\/(payments?|checkout|enrolments?|enrollments?|referrals?|rewards?)(\/|$)/.test(path)) {
    throw new HttpError(503, "Payments, paid enrolments and referral credits are not configured.");
  }
  if (publicWrite) {
    method(request, ["POST"]);
    if (path === '/api/v1/applications' && platformEnabled(env)) throw new HttpError(401, 'Training applications now require a verified account. Use the training portal.');
    if (url.search) throw new HttpError(400, "Query parameters are not accepted on submissions.");
    const key = request.headers.get("idempotency-key") || "";
    if (!UUID.test(key)) throw new HttpError(400, "A valid UUID Idempotency-Key header is required.");
    const kind = path.split("/").at(-1);
    const input = validateSubmission(await readJSON(request), kind);
    if (!configuredSecret(env.SECURITY_SALT)) throw new HttpError(503, "Submissions are temporarily unavailable.");
    const db = database(env);
    const now = new Date();
    // Retries share the ingress rate budget, but never consume another submission slot.
    await limitPublicAttempt(request, env, db, Math.floor(now.getTime() / 1000));
    const payloadHash = await sha256(`${kind}:${JSON.stringify(input)}`);
    const normalizedKey = key.toLowerCase();
    const previous = await getExisting(db, normalizedKey, kind, payloadHash);
    if (previous) return json({ accepted: true, id: previous }, 201);
    const id = await createSubmission(db, env, kind, input, normalizedKey, payloadHash, now);
    return json({ accepted: true, id }, 201);
  }
  if (path === "/api/v1/admin" || path.startsWith("/api/v1/admin/")) {
    await authenticateAdmin(request, env);
    const db = database(env);
    if (path === "/api/v1/admin/submissions") {
      method(request, ["GET"]);
      return json(await listSubmissions(db, url.searchParams));
    }
    const match = /^\/api\/v1\/admin\/submissions\/([^/]+)(\/audit)?$/.exec(path);
    if (match && UUID.test(match[1])) {
      if (url.search) throw new HttpError(400, "Query parameters are not accepted here.");
      if (match[2]) {
        method(request, ["GET"]);
        return json(await readAudit(db, match[1].toLowerCase()));
      }
      method(request, ["PATCH"]);
      return json(await updateStatus(db, match[1].toLowerCase(), validateStatus(await readJSON(request))));
    }
  }
  throw new HttpError(404, "API endpoint not found.");
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const isAPI = url.pathname === "/api" || url.pathname.startsWith("/api/");
    const isAdmin = /^\/admin(?:\.html)?\/?$/.test(url.pathname);
    try {
      if (isAPI) return secureHeaders(await api(request, env, url), request, env, { api: true });
      method(request, ["GET", "HEAD"]);
      if (!env.ASSETS) throw new HttpError(503, "Website assets are not available.");
      if (isAdmin) {
        if (url.search) throw new HttpError(400, "Use the private console without URL parameters.");
        const assetURL = new URL(request.url);
        assetURL.pathname = "/admin.html";
        const asset = await env.ASSETS.fetch(new Request(assetURL, { method: "GET" }));
        if (!asset.ok) throw new HttpError(503, "Private console assets are not available.");
        const nonce = crypto.randomUUID().replace(/-/g, "");
        const body = (await asset.text()).replaceAll("__CSP_NONCE__", nonce);
        if (!body.includes("billioncodes-operations-console")) throw new HttpError(503, "Private console assets are not available.");
        return secureHeaders(new Response(request.method === "HEAD" ? null : body, { headers: { "Content-Type": "text/html; charset=utf-8" } }), request, env, { admin: true, nonce });
      }
      return secureHeaders(await env.ASSETS.fetch(request), request, env);
    } catch (error) {
      // Do not log raw exceptions: D1 errors may include statements or bound personal data.
      const known = error instanceof HttpError;
      const status = known ? error.status : 503;
      const body = { error: known ? error.message : "Service temporarily unavailable. Please retry with the same Idempotency-Key." };
      if (known && error.fields) body.fields = error.fields;
      return secureHeaders(json(body, status, known ? error.headers : {}), request, env, { api: isAPI, admin: isAdmin });
    }
  }
};
