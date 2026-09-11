import { HttpError, KINDS, STATUSES } from "./validation.js";
import { configuredSecret, hmacHex } from "./security.js";

const DAY = 86_400;
const WINDOW = 600;
const deniedRequests = new Map();
const DENIAL_CACHE_LIMIT = 1024;

function denyRequest(key, message, resetAt, nowSeconds) {
  if (deniedRequests.size >= DENIAL_CACHE_LIMIT) deniedRequests.delete(deniedRequests.keys().next().value);
  deniedRequests.set(key, { expiresAt:Math.min(nowSeconds + 5, resetAt), resetAt, message });
  throw new HttpError(429, message, undefined, { "Retry-After":String(resetAt - nowSeconds) });
}
export const CONSENT_VERSION = "enquiry-review-v1-2026-09-11";

export function database(env) {
  if (!env.DB) throw new HttpError(503, "Submission storage is unavailable. Please try again later.");
  return typeof env.DB.withSession === "function" ? env.DB.withSession("first-primary") : env.DB;
}

function setting(env, name, fallback, maximum) {
  const value = Number(env[name]);
  return Number.isSafeInteger(value) && value >= 1 && value <= maximum ? value : fallback;
}

export async function getExisting(db, idempotencyKey, kind, payloadHash) {
  const existing = await db.prepare("SELECT id, kind, payload_hash FROM submissions WHERE idempotency_key = ?").bind(idempotencyKey).first();
  if (!existing) return null;
  if (existing.kind !== kind || existing.payload_hash !== payloadHash) {
    throw new HttpError(409, "This Idempotency-Key was already used for a different submission.");
  }
  return existing.id;
}

export async function limitPublicAttempt(request, env, db, nowSeconds) {
  if (!configuredSecret(env.SECURITY_SALT)) throw new HttpError(503, "Submissions are temporarily unavailable.");
  const day = Math.floor(nowSeconds / DAY);
  const nextDay = (day + 1) * DAY;
  // CF-Connecting-IP is set by the edge. Never trust X-Forwarded-For and never persist raw IP.
  const ip = request.headers.get("cf-connecting-ip") || "unavailable-shared";
  const digest = await hmacHex(env.SECURITY_SALT, `public-enquiry:${day}:${ip}`);
  const bucket = Math.floor(nowSeconds / WINDOW);
  const until = (bucket + 1) * WINDOW;
  const globalKey = `attempts:${day}`;
  const ipKey = `ip:${digest}:${bucket}`;
  const dailyLimit = setting(env, "DAILY_ATTEMPT_CAP", 6000, 100_000);
  const ipLimit = setting(env, "IP_WINDOW_LIMIT", 30, 1000);
  // Best-effort negative cache reduces repeated D1 work; never caches an admission.
  const cacheKey = `${ipKey}:${dailyLimit}:${ipLimit}`;
  const denied = deniedRequests.get(cacheKey);
  if (denied && denied.expiresAt > nowSeconds) {
    throw new HttpError(429, denied.message, undefined, { "Retry-After":String(denied.resetAt - nowSeconds) });
  }
  if (denied) deniedRequests.delete(cacheKey);
  // One transaction admits both counters or neither. No new IP rows after the daily cap.
  // changes() refers to the immediately preceding IP upsert on this batch's connection.
  const results = await db.batch([
    db.prepare("INSERT INTO rate_buckets(bucket_key, count, expires_at) VALUES (?, 0, ?) ON CONFLICT(bucket_key) DO NOTHING")
      .bind(globalKey, nextDay + DAY),
    db.prepare(`INSERT INTO rate_buckets(bucket_key, count, expires_at)
      SELECT ?, 1, ? WHERE (SELECT count FROM rate_buckets WHERE bucket_key = ?) < ?
      ON CONFLICT(bucket_key) DO UPDATE SET count = count + 1 WHERE count < ? RETURNING count`)
      .bind(ipKey, until + 3600, globalKey, dailyLimit, ipLimit),
    db.prepare("UPDATE rate_buckets SET count = count + 1 WHERE bucket_key = ? AND changes() = 1")
      .bind(globalKey),
    db.prepare("SELECT count FROM rate_buckets WHERE bucket_key = ?").bind(globalKey)
  ]);
  if (results[1].results.length) return;
  if (results[3].results[0].count >= dailyLimit) {
    denyRequest(cacheKey, "Today's request limit has been reached. Please try again tomorrow.", nextDay, nowSeconds);
  }
  denyRequest(cacheKey, "Too many requests. Please wait and try again.", until, nowSeconds);
}

export async function createSubmission(db, env, kind, data, idempotencyKey, payloadHash, now) {
  const id = crypto.randomUUID();
  const nowSeconds = Math.floor(now.getTime() / 1000);
  const day = Math.floor(nowSeconds / DAY);
  const timestamp = now.toISOString();
  const quotaKey = `accepted:${day}`;
  const cap = setting(env, "DAILY_SUBMISSION_CAP", 500, 10_000);
  // A single D1 batch transaction serializes quota, unique key and insertion.
  const results = await db.batch([
    db.prepare("INSERT INTO rate_buckets(bucket_key, count, expires_at) VALUES (?, 0, ?) ON CONFLICT(bucket_key) DO NOTHING")
      .bind(quotaKey, (day + 2) * DAY),
    db.prepare(`INSERT INTO submissions(id, kind, idempotency_key, payload_hash, data_json, consent_version, consent_at, created_at, updated_at)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE (SELECT count FROM rate_buckets WHERE bucket_key = ?) < ?
      ON CONFLICT(idempotency_key) DO NOTHING`)
      .bind(id, kind, idempotencyKey, payloadHash, JSON.stringify(data), CONSENT_VERSION, timestamp, timestamp, timestamp, quotaKey, cap),
    db.prepare("UPDATE rate_buckets SET count = count + 1 WHERE bucket_key = ? AND EXISTS (SELECT 1 FROM submissions WHERE id = ?)")
      .bind(quotaKey, id),
    db.prepare("SELECT id, kind, payload_hash FROM submissions WHERE idempotency_key = ?").bind(idempotencyKey),
    db.prepare("DELETE FROM rate_buckets WHERE bucket_key IN (SELECT bucket_key FROM rate_buckets WHERE expires_at < ? ORDER BY expires_at LIMIT 1000)").bind(nowSeconds)
  ]);
  const existing = results[3].results[0];
  if (!existing) throw new HttpError(429, "Today's submission capacity has been reached. Please try again tomorrow.", undefined, { "Retry-After": String((day + 1) * DAY - nowSeconds) });
  if (existing.kind !== kind || existing.payload_hash !== payloadHash) {
    throw new HttpError(409, "This Idempotency-Key was already used for a different submission.");
  }
  return existing.id;
}

function readCursor(cursor) {
  if (!cursor) return null;
  try {
    if (cursor.length > 200 || !/^[a-z0-9_-]+$/i.test(cursor)) throw new Error();
    const parsed = JSON.parse(atob(cursor.replace(/-/g, "+").replace(/_/g, "/")));
    if (!Array.isArray(parsed) || parsed.length !== 2 || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(parsed[0]) || !/^[0-9a-f-]{36}$/.test(parsed[1])) throw new Error();
    return parsed;
  } catch { throw new HttpError(400, "Invalid pagination cursor."); }
}

function rowToSubmission(row) {
  return { id: row.id, kind: row.kind, status: row.status, createdAt: row.created_at, updatedAt: row.updated_at, version: row.version, data: JSON.parse(row.data_json) };
}

export async function listSubmissions(db, params) {
  const keys = ["kind", "status", "limit", "cursor"];
  if ([...params.keys()].some(key => !keys.includes(key) || params.getAll(key).length > 1)) throw new HttpError(400, "Unknown or repeated query parameter.");
  const kind = params.get("kind");
  const status = params.get("status");
  const limitText = params.get("limit") || "20";
  if (kind !== null && !KINDS.includes(kind)) throw new HttpError(400, "Invalid submission kind.");
  if (status !== null && !STATUSES.includes(status)) throw new HttpError(400, "Invalid status.");
  if (!/^\d{1,2}$/.test(limitText) || Number(limitText) < 1 || Number(limitText) > 50) throw new HttpError(400, "Limit must be between 1 and 50.");
  const cursor = readCursor(params.get("cursor"));
  const conditions = [];
  const values = [];
  if (kind) { conditions.push("kind = ?"); values.push(kind); }
  if (status) { conditions.push("status = ?"); values.push(status); }
  if (cursor) { conditions.push("(created_at < ? OR (created_at = ? AND id < ?))"); values.push(cursor[0], cursor[0], cursor[1]); }
  const limit = Number(limitText);
  values.push(limit + 1);
  const { results } = await db.prepare(`SELECT id, kind, status, created_at, updated_at, version, data_json FROM submissions ${conditions.length ? "WHERE " + conditions.join(" AND ") : ""} ORDER BY created_at DESC, id DESC LIMIT ?`).bind(...values).all();
  const page = results.slice(0, limit);
  const last = page.at(-1);
  const nextCursor = results.length > limit ? btoa(JSON.stringify([last.created_at, last.id])).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_") : null;
  return { items: page.map(rowToSubmission), nextCursor };
}

export async function updateStatus(db, id, input) {
  const existing = await db.prepare("SELECT status, version FROM submissions WHERE id = ?").bind(id).first();
  if (!existing) throw new HttpError(404, "Submission not found.");
  if (existing.version !== input.version) throw new HttpError(409, "This submission changed. Refresh before saving.");
  if (existing.status === input.status) return { updated: true, id, status: existing.status, version: existing.version };
  const updated = await db.prepare("UPDATE submissions SET status = ?, updated_at = ?, version = version + 1 WHERE id = ? AND version = ? RETURNING status, version")
    .bind(input.status, new Date().toISOString(), id, input.version).first();
  if (!updated) throw new HttpError(409, "This submission changed. Refresh before saving.");
  return { updated: true, id, ...updated };
}

export async function readAudit(db, id) {
  if (!await db.prepare("SELECT id FROM submissions WHERE id = ?").bind(id).first()) throw new HttpError(404, "Submission not found.");
  const { results } = await db.prepare("SELECT id, previous_status AS previousStatus, status, changed_at AS changedAt, actor, version FROM submission_audit WHERE submission_id = ? ORDER BY id DESC LIMIT 100").bind(id).all();
  return { items: results };
}
