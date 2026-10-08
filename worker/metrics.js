import { HttpError, readJSON } from "./validation.js";
import { checkOrigin, configuredSecret, hmacHex } from "./security.js";
import { database } from "./storage.js";

// Anonymous learning-funnel counters. The browser sends one small event; the server adds one
// to a daily aggregate. Nothing identifies a visitor: no cookies, IDs or addresses are stored.
// The hashed connection is used only for a short-lived rate-limit bucket.

export const FUNNEL = [
  ["home_view", "Visited the homepage"],
  ["start_path", "Chose a starting point"],
  ["lesson_view", "Opened a lesson"],
  ["walkthrough_used", "Stepped through a walkthrough"],
  ["lesson_complete", "Completed a lesson"],
  ["practice_view", "Opened a practice build"],
  ["practice_check", "Checked a build"],
  ["practice_pass", "Passed a build"],
  ["course_enrol", "Added a course to their library"],
  ["training_view", "Viewed training"],
  ["application_submitted", "Sent a training application"],
];
export const EXTRA = [["game_play", "Played Debug Defender"]];
const EVENTS = new Set([...FUNNEL, ...EXTRA].map(([name]) => name));
const SUBJECT = /^[a-z0-9][a-z0-9-]{0,79}(?::[a-z0-9][a-z0-9-]{0,79})?$/;
const DAY = 86_400, WINDOW = 600, RETENTION_DAYS = 400;

const dayKey = seconds => new Date(seconds * 1000).toISOString().slice(0, 10);

export async function recordMetric(request, env) {
  checkOrigin(request, env, true);
  if (request.method !== "POST") throw new HttpError(405, "Method not allowed.", undefined, { Allow: "POST" });
  const input = await readJSON(request);
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some(key => !["event", "subject"].includes(key))) throw new HttpError(400, "Send event and subject only.");
  if (!EVENTS.has(input.event)) throw new HttpError(400, "Unknown event.");
  const subject = input.subject === undefined || input.subject === "" ? "" : input.subject;
  if (subject && (typeof subject !== "string" || !SUBJECT.test(subject))) throw new HttpError(400, "Invalid subject.");
  if (!configuredSecret(env.SECURITY_SALT)) throw new HttpError(503, "Measurement is unavailable.");
  const db = database(env), now = Math.floor(Date.now() / 1000), bucket = Math.floor(now / WINDOW);
  const ip = request.headers.get("cf-connecting-ip") || "unavailable-shared";
  const hash = await hmacHex(env.SECURITY_SALT, `metrics:${Math.floor(now / DAY)}:${ip}`);
  const statements = [
    db.prepare(`INSERT INTO rate_buckets(bucket_key, count, expires_at) VALUES (?, 1, ?)
      ON CONFLICT(bucket_key) DO UPDATE SET count = count + 1 WHERE count < 150 RETURNING count`).bind(`metrics:${hash}:${bucket}`, (bucket + 1) * WINDOW + 3600),
    // Only counts when the rate-limit row above admitted this request.
    db.prepare(`INSERT INTO learning_metrics(day, event, subject, count) SELECT ?, ?, ?, 1 WHERE changes() = 1
      ON CONFLICT(day, event, subject) DO UPDATE SET count = count + 1`).bind(dayKey(now), input.event, subject),
  ];
  if (Math.random() < .01) statements.push(db.prepare("DELETE FROM learning_metrics WHERE day < ?").bind(dayKey(now - RETENTION_DAYS * DAY)));
  const results = await db.batch(statements);
  // A limited sender learns nothing useful; measurement must never disturb learning.
  return new Response(null, { status: results[0].results.length ? 204 : 429 });
}

// Staff report: funnel totals, per-subject breakdowns and a daily series for the chosen period.
export async function metricsReport(db, url) {
  const keys = [...url.searchParams.keys()];
  const days = Number(url.searchParams.get("days") || 30);
  if (keys.some(key => key !== "days") || ![7, 30, 90].includes(days)) throw new HttpError(400, "Use days=7, 30 or 90.");
  const now = Math.floor(Date.now() / 1000), since = dayKey(now - (days - 1) * DAY);
  const { results } = await db.prepare("SELECT day, event, subject, count FROM learning_metrics WHERE day >= ? ORDER BY day").bind(since).all();
  const totals = {}, subjects = {}, daily = {};
  for (const row of results) {
    totals[row.event] = (totals[row.event] || 0) + row.count;
    if (row.subject) (subjects[row.event] ||= {})[row.subject] = (subjects[row.event][row.subject] || 0) + row.count;
    (daily[row.day] ||= {})[row.event] = (daily[row.day][row.event] || 0) + row.count;
  }
  return {
    days, since,
    funnel: FUNNEL.map(([event, label]) => ({ event, label, count: totals[event] || 0 })),
    extra: EXTRA.map(([event, label]) => ({ event, label, count: totals[event] || 0 })),
    subjects,
    daily: Object.entries(daily).map(([day, counts]) => ({ day, ...counts })),
  };
}
