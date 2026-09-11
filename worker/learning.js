import { catalog } from './catalog.js';
import { HttpError } from './validation.js';
import { exactFields, textValue, quota } from './identity.js';

export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export function identifier(value) {
  if (typeof value !== 'string' || value.length > 80 || !SLUG.test(value)) throw new HttpError(400, 'Invalid identifier.');
  return value;
}
const builtin = catalog.courses.map(course => ({ ...course, status: 'published', priceMinor: 0, currency: 'NGN', version: 1, builtin: true, lessons: course.lessons.map(lesson => ({ ...lesson, kind: 'text', resourceId: null })) }));
const rowCourse = row => ({ id: row.id, title: row.title, summary: row.summary, level: row.level, status: row.status, priceMinor: row.price_minor, currency: row.currency, version: row.version, builtin: false });
export async function getCourse(db, id) {
  const base = builtin.find(course => course.id === id);
  if (base) return base;
  const row = await db.prepare('SELECT * FROM learning_courses WHERE id=?').bind(id).first();
  if (!row) throw new HttpError(404, 'Course not found.');
  const { results } = await db.prepare('SELECT * FROM learning_lessons WHERE course_id=? ORDER BY position').bind(id).all();
  return { ...rowCourse(row), lessons: results.map(lesson => ({ id: lesson.id, title: lesson.title, kind: lesson.kind, body: JSON.parse(lesson.body_json), resourceId: lesson.resource_id })) };
}
export async function courseCatalogue(db, staff = false) {
  const { results } = await db.prepare(`SELECT c.*,(SELECT count(*) FROM learning_lessons WHERE course_id=c.id) AS lesson_count FROM learning_courses c ${staff ? '' : "WHERE status='published'"} ORDER BY created_at DESC LIMIT 100`).all();
  return { courses: [...builtin, ...results.map(row => ({...rowCourse(row),lessonCount:row.lesson_count}))].map(({ lessons, ...course }) => ({ ...course, ...(lessons ? { lessonCount: lessons.length } : {}) })), checkoutEnabled: false };
}
export async function hasEnrolment(db, userId, courseId) {
  return !!await db.prepare('SELECT 1 FROM learning_enrolments WHERE user_id=? AND course_id=?').bind(userId, courseId).first();
}
export async function courseForLearner(db, user, id) {
  const course = await getCourse(db, identifier(id));
  const enrolled = !!user && await hasEnrolment(db, user.id, id);
  if (course.status !== 'published' && !(enrolled && course.status === 'archived')) throw new HttpError(404, 'Course not available.');
  const { results } = user && enrolled ? await db.prepare('SELECT lesson_id FROM learning_progress WHERE user_id=? AND course_id=? AND completed=1').bind(user.id, id).all() : { results: [] };
  return { course: { ...course, lessons: course.lessons.map(lesson => enrolled ? lesson : { id: lesson.id, title: lesson.title, kind: lesson.kind }) }, enrolled, completed: results.map(row => row.lesson_id), checkoutEnabled: false };
}
export async function enrol(db, user, id) {
  const course = await getCourse(db, identifier(id));
  if (course.status !== 'published') throw new HttpError(404, 'Course not available.');
  if (course.priceMinor !== 0) throw new HttpError(503, 'Paid checkout is not configured. No payment or enrolment has been created.');
  await db.prepare("INSERT INTO learning_enrolments(user_id,course_id,source,created_at) VALUES (?,?,'free',?) ON CONFLICT(user_id,course_id) DO NOTHING")
    .bind(user.id, id, new Date().toISOString()).run();
  return { enrolled: true };
}
export async function library(db, user) {
  const { results } = await db.prepare('SELECT course_id FROM learning_enrolments WHERE user_id=? ORDER BY created_at DESC LIMIT 100').bind(user.id).all();
  const courses = [];
  for (const row of results) {
    const value = await courseForLearner(db, user, row.course_id);
    courses.push({ ...value.course, lessons: undefined, lessonCount: value.course.lessons.length, completed: value.completed.length });
  }
  return { courses };
}
export async function saveProgress(db, user, id, lessonId, input) {
  exactFields(input, ['completed']);
  if (typeof input.completed !== 'boolean') throw new HttpError(400, 'Choose whether this lesson is complete.');
  const { course, enrolled } = await courseForLearner(db, user, id);
  if (!enrolled) throw new HttpError(403, 'Add this course to your library before saving progress.');
  if (!course.lessons.some(lesson => lesson.id === lessonId)) throw new HttpError(404, 'Lesson not found.');
  await db.prepare(`INSERT INTO learning_progress(user_id,course_id,lesson_id,completed,updated_at) VALUES (?,?,?,?,?)
    ON CONFLICT(user_id,course_id,lesson_id) DO UPDATE SET completed=excluded.completed,updated_at=excluded.updated_at`)
    .bind(user.id, id, lessonId, input.completed ? 1 : 0, new Date().toISOString()).run();
  return { saved: true };
}
export async function audit(db, type, id, action, actor = 'staff') {
  await db.prepare('INSERT INTO learning_audit(entity_type,entity_id,action,actor,created_at) VALUES (?,?,?,?,?)').bind(type, id, action, actor, new Date().toISOString()).run();
}
export async function createCourse(db, input) {
  exactFields(input, ['id', 'title', 'summary', 'level', 'priceMinor']);
  const id = identifier(input.id);
  if (builtin.some(course => course.id === id)) throw new HttpError(409, 'This identifier belongs to a published introduction.');
  const title = textValue(input.title, 5, 140, 'Title'), summary = textValue(input.summary, 20, 1500, 'Summary'), level = textValue(input.level, 3, 40, 'Level');
  if (!Number.isSafeInteger(input.priceMinor) || input.priceMinor < 0 || input.priceMinor > 100000000) throw new HttpError(400, 'Price must be a whole number of kobo between 0 and 100,000,000.');
  const now = new Date().toISOString();
  const row = await db.prepare('INSERT INTO learning_courses(id,title,summary,level,price_minor,created_at,updated_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING RETURNING id')
    .bind(id, title, summary, level, input.priceMinor, now, now).first();
  if (!row) throw new HttpError(409, 'That course identifier is already in use.');
  await audit(db, 'course', id, 'created');
  return { course: await getCourse(db, id) };
}
export async function addLesson(db, id, input) {
  exactFields(input, ['title', 'kind', 'body', 'resourceId']);
  const course = await getCourse(db, identifier(id));
  if (course.builtin || course.status !== 'draft') throw new HttpError(409, 'Only unpublished draft courses can be edited.');
  if (course.lessons.length >= 100) throw new HttpError(400, 'A course may have at most 100 lessons.');
  const title = textValue(input.title, 3, 160, 'Lesson title');
  if (!['text','pdf','video'].includes(input.kind)) throw new HttpError(400, 'Choose text, PDF or video.');
  let body = [], resource = null;
  if (input.kind === 'text') body = textValue(input.body, 40, 10000, 'Lesson text').split(/\n\s*\n/);
  else {
    resource = await db.prepare("SELECT id FROM learning_resources WHERE id=? AND course_id=? AND kind=? AND status='ready'").bind(identifier(input.resourceId), id, input.kind).first();
    if (!resource) throw new HttpError(400, 'Select a ready resource belonging to this course.');
    if (input.body) body = [textValue(input.body, 1, 5000, 'Lesson notes')];
  }
  const lessonId = crypto.randomUUID();
  const inserted = await db.prepare(`INSERT INTO learning_lessons(id,course_id,title,kind,body_json,resource_id,position)
    SELECT ?,?,?,?,?,?,(SELECT COALESCE(MAX(position),-1)+1 FROM learning_lessons WHERE course_id=?)
    WHERE EXISTS(SELECT 1 FROM learning_courses WHERE id=? AND status='draft') AND (SELECT count(*) FROM learning_lessons WHERE course_id=?)<100
    AND (SELECT COALESCE(SUM(length(CAST(body_json AS BLOB))),0) FROM learning_lessons WHERE course_id=?) + ? <= 250000 RETURNING id`)
    .bind(lessonId,id,title,input.kind,JSON.stringify(body),resource?.id || null,id,id,id,id,new TextEncoder().encode(JSON.stringify(body)).length).first();
  if (!inserted) throw new HttpError(409,'This course changed, is no longer editable, or reached its 100-lesson/250 KB text budget.');
  await audit(db, 'course', id, 'lesson-added');
  return { course: await getCourse(db, id) };
}
export async function publishCourse(db, id, input) {
  exactFields(input, ['version']);
  const course = await getCourse(db, identifier(id));
  if (course.builtin || course.status !== 'draft') throw new HttpError(409, 'Only a draft course can be published.');
  if (!course.lessons.length) throw new HttpError(400, 'Add at least one complete lesson before publishing.');
  const changed = await db.prepare("UPDATE learning_courses SET status='published',version=version+1,updated_at=? WHERE id=? AND version=? AND status='draft' RETURNING id")
    .bind(new Date().toISOString(), id, input.version).first();
  if (!changed) throw new HttpError(409, 'This course changed. Refresh before publishing.');
  await audit(db, 'course', id, 'published');
  return { course: await getCourse(db, id) };
}

export async function uploadPDF(request, env, db, id) {
  if (!env.COURSE_FILES) throw new HttpError(503, 'Private file storage is not configured.');
  const course = await getCourse(db, identifier(id));
  if (course.builtin || course.status !== 'draft') throw new HttpError(409, 'Upload files to an unpublished draft course.');
  if (request.headers.get('content-type') !== 'application/pdf' || request.headers.get('x-content-rights') !== 'confirmed') throw new HttpError(400, 'Upload a PDF and confirm your permission to publish it.');
  const filename = textValue(request.headers.get('x-file-name'), 5, 100, 'Filename');
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._ -]*\.pdf$/i.test(filename)) throw new HttpError(400, 'Use a simple PDF filename.');
  const max = 20 * 1024 * 1024;
  if (Number(request.headers.get('content-length') || 0) > max || request.headers.has('content-encoding')) throw new HttpError(413, 'PDF files must be uncompressed uploads of 20 MB or smaller.');
  await quota(db, 'pdf-uploads', 20, 86400);
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, 'Choose a PDF file.');
  const chunks = []; let size = 0;
  try { while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > max) { await reader.cancel(); throw new HttpError(413, 'PDF files must be 20 MB or smaller.'); } chunks.push(part.value); } } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  if (new TextDecoder().decode(bytes.slice(0,5)) !== '%PDF-' || !new TextDecoder().decode(bytes.slice(-1024)).includes('%%EOF')) throw new HttpError(400, 'This does not look like a complete PDF.');
  const resourceId = crypto.randomUUID(), key = `courses/${id}/${resourceId}.pdf`;
  // Reserve space atomically before storage writes. Failed/unfinished uploads also count until reviewed.
  const reserved = await db.prepare(`INSERT INTO learning_resources(id,course_id,kind,object_key,filename,size_bytes,status,created_at,rights_confirmed)
    SELECT ?,?,'pdf',?,?,?,'uploading',?,1 WHERE (SELECT COALESCE(SUM(size_bytes),0) FROM learning_resources) + ? <= 2000000000 RETURNING id`)
    .bind(resourceId,id,key,filename,size,new Date().toISOString(),size).first();
  if (!reserved) throw new HttpError(409, 'The initial 2 GB file-storage budget has been reached. Contact the operator before increasing it.');
  try {
    await env.COURSE_FILES.put(key, bytes, { httpMetadata: { contentType: 'application/pdf' } });
    await db.prepare("UPDATE learning_resources SET status='ready' WHERE id=?").bind(resourceId).run();
  } catch {
    await db.prepare("UPDATE learning_resources SET status='failed' WHERE id=?").bind(resourceId).run();
    throw new HttpError(503, 'Upload was not completed. Staff must review the failed resource before retrying.');
  }
  await audit(db, 'resource', resourceId, 'pdf-uploaded');
  return { resource: { id: resourceId, kind: 'pdf', filename, sizeBytes: size, status: 'ready' } };
}
export async function resourceForLearner(db, user, id) {
  const resource = await db.prepare("SELECT * FROM learning_resources WHERE id=? AND status='ready'").bind(identifier(id)).first();
  if (!resource || !await hasEnrolment(db, user.id, resource.course_id)) throw new HttpError(404, 'Resource not available in your library.');
  const course = await getCourse(db, resource.course_id);
  if (!['published','archived'].includes(course.status) || !course.lessons.some(lesson => lesson.resourceId === id)) throw new HttpError(404, 'Resource is not part of a published lesson.');
  return resource;
}
export async function downloadPDF(env, resource) {
  if (resource.kind !== 'pdf' || !env.COURSE_FILES) throw new HttpError(503, 'This PDF is not available.');
  const object = await env.COURSE_FILES.get(resource.object_key);
  if (!object) throw new HttpError(404, 'The resource file could not be found.');
  return new Response(object.body, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${resource.filename}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
}
export async function registerVideo(env, db, id, input) {
  exactFields(input, ['uid', 'title', 'rightsConfirmed']);
  if (!env.STREAM_API_TOKEN || !env.STREAM_ACCOUNT_ID) throw new HttpError(503, 'Cloudflare Stream is not configured. No video capacity has been purchased by this app.');
  const course = await getCourse(db, identifier(id));
  if (course.builtin || course.status !== 'draft' || !/^[a-f0-9]{32}$/.test(input.uid || '') || input.rightsConfirmed !== true) throw new HttpError(400, 'Choose a draft course, a valid Stream video ID and confirm publishing rights.');
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.STREAM_ACCOUNT_ID}/stream/${input.uid}`, { headers: { Authorization: `Bearer ${env.STREAM_API_TOKEN}` }, signal: AbortSignal.timeout(10000) });
  const result = await response.json();
  if (!response.ok || !result.success || !result.result?.readyToStream || result.result.requireSignedURLs !== true) throw new HttpError(400, 'The video must be processed and require signed playback URLs in Cloudflare Stream.');
  const resourceId = crypto.randomUUID();
  await db.prepare("INSERT INTO learning_resources(id,course_id,kind,stream_uid,filename,status,created_at,rights_confirmed) VALUES (?,?,'video',?,?,'ready',?,1)")
    .bind(resourceId,id,input.uid,textValue(input.title,3,140,'Video title'),new Date().toISOString()).run();
  await audit(db, 'resource', resourceId, 'video-registered');
  return { resource: { id: resourceId, kind: 'video', status: 'ready' } };
}
export async function videoPlayback(env, resource) {
  if (resource.kind !== 'video' || !env.STREAM_API_TOKEN || !env.STREAM_ACCOUNT_ID) throw new HttpError(503, 'Protected video playback is not configured.');
  const expires = Math.floor(Date.now()/1000) + 300;
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.STREAM_ACCOUNT_ID}/stream/${resource.stream_uid}/token`, { method:'POST', headers:{ Authorization:`Bearer ${env.STREAM_API_TOKEN}`, 'Content-Type':'application/json' }, body:JSON.stringify({ exp: expires }), signal:AbortSignal.timeout(10000) });
  const result = await response.json();
  if (!response.ok || !result.success || typeof result.result?.token !== 'string' || !/^[A-Za-z0-9._-]+$/.test(result.result.token)) throw new HttpError(503, 'Protected playback could not be started.');
  return { url: `https://iframe.videodelivery.net/${result.result.token}`, expiresAt: expires };
}
