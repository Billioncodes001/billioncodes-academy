import { HttpError, UUID, readJSON } from "./validation.js";
import { checkOrigin, configuredSecret, hmacHex } from "./security.js";
import { database } from "./storage.js";

// Debug Defender leaderboard.
// The browser cannot be trusted, so every score is tied to a run the server opened
// and timed itself. A submission is rejected when it is faster or bigger than the
// game's own rules allow. This stops casual cheating, not a determined attacker:
// staff can hide or delete any entry from the private console.

const DAY = 86_400;
const WINDOW = 600;
const RUN_TTL = 3 * 3600;
const MAX_WAVE = 500;

// Mirrors src/motion/particleHero.ts. Keep these in step with the game.
const bugsInWave = wave => 4 + wave * 2 + (wave % 3 === 0 ? 1 : 0);
const hasBoss = wave => wave % 3 === 0;
const MAX_COMBO = 8, BUG_POINTS = 10, BOSS_POINTS = 100;

export function maxScoreThrough(wave) {
  let total = 0;
  for (let k = 1; k <= wave; k++) total += (bugsInWave(k) - (hasBoss(k) ? 1 : 0)) * BUG_POINTS * MAX_COMBO + (hasBoss(k) ? BOSS_POINTS * MAX_COMBO : 0);
  return total;
}

// Fastest possible time to reach a wave: every bug spawns at the minimum interval
// and dies instantly, then the 1.2 s break between waves.
export function minSecondsToReach(wave) {
  let seconds = 0;
  for (let k = 1; k < wave; k++) seconds += .4 + (bugsInWave(k) - 1) * Math.max(.25, 1.1 - k * .08) * .6 + 1.2;
  return seconds;
}

const BLOCKED = /(fuck|shit|cunt|nigg|fag|bitch|whore|slut|rape|nazi|hitler|porn|dick|pussy|asshole|wank)/i;

export function validateName(value) {
  if (typeof value !== "string") throw new HttpError(400, "Choose a name to show on the leaderboard.", { name: "Enter 2 to 16 letters or numbers." });
  const name = value.trim().replace(/\s+/g, " ");
  const length = [...name].length;
  if (length < 2 || length > 16 || !/^[\p{L}\p{N} ._-]+$/u.test(name) || !/[\p{L}\p{N}]/u.test(name)) {
    throw new HttpError(400, "Use 2 to 16 letters, numbers, spaces, dots, dashes or underscores.", { name: "Use 2 to 16 letters, numbers, spaces, dots, dashes or underscores." });
  }
  if (BLOCKED.test(name.replace(/[\s._-]/g, ""))) throw new HttpError(400, "Please choose a different name.", { name: "Please choose a different name." });
  return name;
}

function intField(value, min, max, label) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new HttpError(400, `${label} is not valid.`);
  return value;
}

async function ipHash(request, env, nowSeconds) {
  if (!configuredSecret(env.SECURITY_SALT)) throw new HttpError(503, "The leaderboard is temporarily unavailable.");
  // CF-Connecting-IP is set by the edge. The raw address is never stored.
  const ip = request.headers.get("cf-connecting-ip") || "unavailable-shared";
  return hmacHex(env.SECURITY_SALT, `arcade:${Math.floor(nowSeconds / DAY)}:${ip}`);
}

// One counter per IP per ten minutes, plus a daily ceiling for the whole game.
async function limitRuns(db, hash, nowSeconds) {
  const bucket = Math.floor(nowSeconds / WINDOW), day = Math.floor(nowSeconds / DAY);
  const ipKey = `arcade-ip:${hash}:${bucket}`, dayKey = `arcade-day:${day}`;
  const results = await db.batch([
    db.prepare(`INSERT INTO rate_buckets(bucket_key, count, expires_at) VALUES (?, 1, ?)
      ON CONFLICT(bucket_key) DO UPDATE SET count = count + 1 WHERE count < ? RETURNING count`).bind(ipKey, (bucket + 1) * WINDOW + 3600, 40),
    db.prepare(`INSERT INTO rate_buckets(bucket_key, count, expires_at) VALUES (?, 1, ?)
      ON CONFLICT(bucket_key) DO UPDATE SET count = count + 1 WHERE count < ? RETURNING count`).bind(dayKey, (day + 2) * DAY, 50_000),
  ]);
  if (!results[0].results.length) throw new HttpError(429, "Lots of games from this connection. Take a short break and try again.", undefined, { "Retry-After": String((bucket + 1) * WINDOW - nowSeconds) });
  if (!results[1].results.length) throw new HttpError(429, "The leaderboard is very busy today. Your game still works; try submitting tomorrow.", undefined, { "Retry-After": String((day + 1) * DAY - nowSeconds) });
}

const entry = (row, rank) => ({ rank, id: row.id, name: row.name, score: row.score, wave: row.wave, createdAt: row.created_at });

async function topScores(db, period, nowSeconds) {
  const since = period === "week" ? new Date((nowSeconds - 7 * DAY) * 1000).toISOString() : "";
  const { results } = await db.prepare(`SELECT id, name, score, wave, created_at FROM arcade_scores
    WHERE hidden = 0 AND created_at >= ? ORDER BY score DESC, created_at ASC LIMIT 10`).bind(since).all();
  return results.map((row, index) => entry(row, index + 1));
}

export async function arcadeRoute(request, env, url) {
  const path = url.pathname;
  const nowSeconds = Math.floor(Date.now() / 1000);

  if (path === "/api/v1/arcade/leaderboard") {
    checkOrigin(request, env);
    if (request.method !== "GET") throw new HttpError(405, "Method not allowed.", undefined, { Allow: "GET" });
    const period = url.searchParams.get("period") || "all";
    if (!["all", "week"].includes(period) || [...url.searchParams.keys()].some(key => key !== "period")) throw new HttpError(400, "Use period=all or period=week.");
    return Response.json({ period, entries: await topScores(database(env), period, nowSeconds) });
  }

  if (path === "/api/v1/arcade/runs") {
    checkOrigin(request, env, true);
    if (request.method !== "POST") throw new HttpError(405, "Method not allowed.", undefined, { Allow: "POST" });
    if (url.search) throw new HttpError(400, "Query parameters are not accepted here.");
    const db = database(env);
    const hash = await ipHash(request, env, nowSeconds);
    await limitRuns(db, hash, nowSeconds);
    const id = crypto.randomUUID();
    const statements = [db.prepare("INSERT INTO arcade_runs(id, started_at, expires_at, ip_hash) VALUES (?, ?, ?, ?)").bind(id, nowSeconds, nowSeconds + RUN_TTL, hash)];
    // Opportunistic cleanup keeps the run table small without a cron job.
    if (Math.random() < .05) statements.push(db.prepare("DELETE FROM arcade_runs WHERE expires_at < ?").bind(nowSeconds));
    await db.batch(statements);
    return Response.json({ runId: id }, { status: 201 });
  }

  if (path === "/api/v1/arcade/scores") {
    checkOrigin(request, env, true);
    if (request.method !== "POST") throw new HttpError(405, "Method not allowed.", undefined, { Allow: "POST" });
    if (url.search) throw new HttpError(400, "Query parameters are not accepted here.");
    const input = await readJSON(request);
    if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some(key => !["runId", "name", "score", "wave"].includes(key))) throw new HttpError(400, "Send runId, name, score and wave only.");
    if (typeof input.runId !== "string" || !UUID.test(input.runId)) throw new HttpError(400, "This game could not be found. Play again to submit a score.");
    const name = validateName(input.name);
    const wave = intField(input.wave, 1, MAX_WAVE, "Wave");
    const score = intField(input.score, 0, 1_000_000, "Score");
    const db = database(env);
    const run = await db.prepare("SELECT started_at, expires_at, submitted FROM arcade_runs WHERE id = ?").bind(input.runId.toLowerCase()).first();
    if (!run || run.expires_at < nowSeconds) throw new HttpError(404, "This game has expired. Play again to submit a score.");
    if (run.submitted) throw new HttpError(409, "This game's score has already been submitted.");
    const duration = nowSeconds - run.started_at;
    // Allow for clock rounding and network delay, never for a faster game than the rules permit.
    if (score % BUG_POINTS !== 0 || score > maxScoreThrough(wave) || duration + 2 < minSecondsToReach(wave) * .75) {
      throw new HttpError(422, "This score could not be verified, so it was not added to the leaderboard.");
    }
    const id = crypto.randomUUID(), createdAt = new Date(nowSeconds * 1000).toISOString();
    // Claiming the run and inserting the score happen in one transaction, so a run counts once.
    const results = await db.batch([
      db.prepare("UPDATE arcade_runs SET submitted = 1 WHERE id = ? AND submitted = 0").bind(input.runId.toLowerCase()),
      db.prepare(`INSERT INTO arcade_scores(id, run_id, name, score, wave, duration, created_at)
        SELECT ?, ?, ?, ?, ?, ?, ? WHERE changes() = 1`).bind(id, input.runId.toLowerCase(), name, score, wave, duration, createdAt),
    ]);
    if (!results[1].meta.changes) throw new HttpError(409, "This game's score has already been submitted.");
    const ahead = await db.prepare("SELECT COUNT(*) AS n FROM arcade_scores WHERE hidden = 0 AND (score > ? OR (score = ? AND created_at < ?))").bind(score, score, createdAt).first();
    return Response.json({ accepted: true, entry: entry({ id, name, score, wave, created_at: createdAt }, ahead.n + 1), top: await topScores(db, "all", nowSeconds) }, { status: 201 });
  }

  throw new HttpError(404, "API endpoint not found.");
}

// Staff moderation: list recent entries (including hidden ones), hide/unhide, delete.
export async function arcadeAdmin(request, db, url, session) {
  if (url.pathname === "/api/v1/admin/arcade") {
    if (request.method !== "GET") throw new HttpError(405, "Method not allowed.", undefined, { Allow: "GET" });
    if (url.search) throw new HttpError(400, "Query parameters are not accepted here.");
    const { results } = await db.prepare("SELECT id, name, score, wave, duration, created_at, hidden, moderated_by FROM arcade_scores ORDER BY created_at DESC LIMIT 200").all();
    return { entries: results.map(row => ({ id: row.id, name: row.name, score: row.score, wave: row.wave, duration: row.duration, createdAt: row.created_at, hidden: !!row.hidden, moderatedBy: row.moderated_by })) };
  }
  const match = /^\/api\/v1\/admin\/arcade\/([^/]+)$/.exec(url.pathname);
  if (!match || !UUID.test(match[1])) throw new HttpError(404, "Leaderboard entry not found.");
  const id = match[1].toLowerCase();
  if (url.search) throw new HttpError(400, "Query parameters are not accepted here.");
  if (request.method === "DELETE") {
    const result = await db.prepare("DELETE FROM arcade_scores WHERE id = ?").bind(id).run();
    if (!result.meta.changes) throw new HttpError(404, "Leaderboard entry not found.");
    return { deleted: true, id };
  }
  if (request.method === "PATCH") {
    const input = await readJSON(request);
    if (!input || typeof input.hidden !== "boolean" || Object.keys(input).length !== 1) throw new HttpError(400, "Send { \"hidden\": true } or { \"hidden\": false }.");
    const result = await db.prepare("UPDATE arcade_scores SET hidden = ?, moderated_by = ? WHERE id = ?").bind(input.hidden ? 1 : 0, session.actor, id).run();
    if (!result.meta.changes) throw new HttpError(404, "Leaderboard entry not found.");
    return { id, hidden: input.hidden };
  }
  throw new HttpError(405, "Method not allowed.", undefined, { Allow: "PATCH, DELETE" });
}
