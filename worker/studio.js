import { HttpError } from './validation.js';
import { configuredSecret, hmacHex } from './security.js';
import { exactFields, textValue, quota } from './identity.js';
import { validateWalkthrough } from '@billioncodes/learning';
import { getCourse, audit, identifier, sectionValue } from './learning.js';

// Course Studio: draft editing, chunked private R2 video uploads and signed range playback.
const GB = 1_000_000_000;
export const VIDEO_PART_BYTES = 8 * 1024 * 1024; // R2 needs equal parts of at least 5 MiB, except the last.
export const VIDEO_MAX_BYTES = 1024 * 1024 * 1024;
const MEDIA_TTL = 4 * 3600;
const VIDEO_TYPES = { mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm' };

function missingMultipartUpload(error) {
  return error?.code === 'NoSuchUpload' || error?.name === 'NoSuchUpload'
    || /(?:multipart upload|upload id).*(?:does not exist|not found|expired)|NoSuchUpload/i.test(String(error?.message || ''));
}

// Ledger cap for all private course files. Defaults to 2 GB; operators may raise it up to 9 GB,
// which stays inside R2's 10 GB-month account allowance. This is not an account-wide billing cap.
export function storageLimit(env) {
  const value = Number(env.COURSE_STORAGE_LIMIT_GB);
  return (Number.isInteger(value) && value >= 1 && value <= 9 ? value : 2) * GB;
}

function draftOnly(course) {
  if (course.builtin || course.status !== 'draft') throw new HttpError(409, 'Only unpublished draft courses can be edited. Return the course to draft first.');
  return course;
}

export async function staffCourse(env, db, id) {
  const course = await getCourse(db, identifier(id));
  const { results } = await db.prepare(`SELECT r.id,r.kind,r.filename,r.size_bytes AS sizeBytes,r.status,r.created_at AS createdAt,u.content_type AS contentType,u.part_size AS partSize,u.part_count AS partCount,
      (SELECT count(*) FROM learning_upload_parts p WHERE p.resource_id=r.id) AS uploadedParts,
      (SELECT group_concat(part_number) FROM learning_upload_parts p WHERE p.resource_id=r.id) AS uploadedList,
      (SELECT count(*) FROM learning_lessons l WHERE l.resource_id=r.id) AS usedBy
    FROM learning_resources r LEFT JOIN learning_media_uploads u ON u.resource_id=r.id WHERE r.course_id=? ORDER BY r.created_at DESC LIMIT 100`).bind(course.id).all();
  const enrolments = course.builtin ? null : (await db.prepare('SELECT count(*) AS count FROM learning_enrolments WHERE course_id=?').bind(course.id).first()).count;
  const used = (await db.prepare('SELECT COALESCE(SUM(size_bytes),0) AS used FROM learning_resources').first()).used;
  return { course, resources: results.map(({ uploadedList, ...row }) => ({ ...row, uploadedPartNumbers: uploadedList ? String(uploadedList).split(',').map(Number) : [] })), enrolments, storage: { usedBytes: used, limitBytes: storageLimit(env) } };
}

export async function updateCourse(db, id, input) {
  exactFields(input, ['title', 'summary', 'level', 'priceMinor', 'version']);
  draftOnly(await getCourse(db, identifier(id)));
  const title = textValue(input.title, 5, 140, 'Title'), summary = textValue(input.summary, 20, 1500, 'Summary'), level = textValue(input.level, 3, 40, 'Level');
  if (!Number.isSafeInteger(input.priceMinor) || input.priceMinor < 0 || input.priceMinor > 100000000) throw new HttpError(400, 'Price must be a whole number of kobo between 0 and 100,000,000.');
  const changed = await db.prepare("UPDATE learning_courses SET title=?,summary=?,level=?,price_minor=?,version=version+1,updated_at=? WHERE id=? AND version=? AND status='draft' RETURNING id")
    .bind(title, summary, level, input.priceMinor, new Date().toISOString(), id, input.version).first();
  if (!changed) throw new HttpError(409, 'This course changed. Refresh before saving.');
  await audit(db, 'course', id, 'details-updated');
  return { course: await getCourse(db, id) };
}

export async function returnToDraft(db, id, input) {
  exactFields(input, ['version']);
  const course = await getCourse(db, identifier(id));
  if (course.builtin || course.status !== 'published') throw new HttpError(409, 'Only a published course can return to draft.');
  // Learners who already joined keep access to what they enrolled in; editing it underneath them is not allowed.
  const changed = await db.prepare(`UPDATE learning_courses SET status='draft',version=version+1,updated_at=? WHERE id=? AND version=? AND status='published'
    AND NOT EXISTS(SELECT 1 FROM learning_enrolments WHERE course_id=?) RETURNING id`).bind(new Date().toISOString(), id, input.version, id).first();
  if (!changed) throw new HttpError(409, 'Learners have already joined this course, or it changed. Refresh before trying again.');
  await audit(db, 'course', id, 'returned-to-draft');
  return { course: await getCourse(db, id) };
}

async function draftLesson(db, id, lessonId) {
  const course = draftOnly(await getCourse(db, identifier(id)));
  const lesson = course.lessons.find(item => item.id === identifier(lessonId));
  if (!lesson) throw new HttpError(404, 'Lesson not found.');
  return { course, lesson };
}

// Walkthroughs are validated by the same rules the learner's browser uses.
function walkthroughValue(value) {
  if (value === undefined || value === null) return null;
  try { return validateWalkthrough(value); } catch (error) { throw new HttpError(400, error.message); }
}

export async function updateLesson(db, id, lessonId, input) {
  exactFields(input, ['title', 'body', 'resourceId', 'section', 'walkthrough']);
  const { lesson } = await draftLesson(db, id, lessonId);
  const title = textValue(input.title, 3, 160, 'Lesson title'), section = sectionValue(input.section);
  const walkthrough = walkthroughValue(input.walkthrough);
  if (walkthrough && lesson.kind !== 'text') throw new HttpError(400, 'Walkthroughs can be added to reading lessons only.');
  let body = [], resourceId = null;
  if (lesson.kind === 'text') body = textValue(input.body, 40, 10000, 'Lesson text').split(/\n\s*\n/);
  else {
    const resource = await db.prepare("SELECT id FROM learning_resources WHERE id=? AND course_id=? AND kind=? AND status='ready'").bind(identifier(input.resourceId), id, lesson.kind).first();
    if (!resource) throw new HttpError(400, 'Select a ready resource belonging to this course.');
    resourceId = resource.id;
    if (input.body) body = [textValue(input.body, 1, 5000, 'Lesson notes')];
  }
  const bytes = new TextEncoder().encode(JSON.stringify(body)).length;
  const changed = await db.prepare(`UPDATE learning_lessons SET title=?,body_json=?,resource_id=? WHERE id=? AND course_id=?
    AND EXISTS(SELECT 1 FROM learning_courses WHERE id=? AND status='draft')
    AND (SELECT COALESCE(SUM(length(CAST(body_json AS BLOB))),0) FROM learning_lessons WHERE course_id=? AND id<>?) + ? <= 250000 RETURNING id`)
    .bind(title, JSON.stringify(body), resourceId, lesson.id, id, id, id, lesson.id, bytes).first();
  if (!changed) throw new HttpError(409, 'This course changed, is no longer editable, or reached its 250 KB text budget.');
  await db.batch([
    db.prepare('DELETE FROM learning_lesson_sections WHERE lesson_id=?').bind(lesson.id),
    ...(section ? [db.prepare('INSERT INTO learning_lesson_sections(lesson_id,section) VALUES (?,?)').bind(lesson.id, section)] : []),
    db.prepare('DELETE FROM learning_lesson_walkthroughs WHERE lesson_id=?').bind(lesson.id),
    ...(walkthrough ? [db.prepare('INSERT INTO learning_lesson_walkthroughs(lesson_id,walkthrough_json) VALUES (?,?)').bind(lesson.id, JSON.stringify(walkthrough))] : []),
  ]);
  await audit(db, 'course', id, 'lesson-updated');
  return { course: await getCourse(db, id) };
}

export async function deleteLesson(db, id, lessonId) {
  const { lesson } = await draftLesson(db, id, lessonId);
  const removed = await db.prepare("DELETE FROM learning_lessons WHERE id=? AND course_id=? AND EXISTS(SELECT 1 FROM learning_courses WHERE id=? AND status='draft') RETURNING id").bind(lesson.id, id, id).first();
  if (!removed) throw new HttpError(409, 'This course is no longer editable. Refresh and try again.');
  await audit(db, 'course', id, 'lesson-removed');
  return { course: await getCourse(db, id) };
}

export async function moveLesson(db, id, lessonId, input) {
  exactFields(input, ['direction']);
  if (!['up', 'down'].includes(input.direction)) throw new HttpError(400, 'Move a lesson up or down.');
  const { course, lesson } = await draftLesson(db, id, lessonId);
  const index = course.lessons.indexOf(lesson), other = course.lessons[index + (input.direction === 'up' ? -1 : 1)];
  if (!other) return { course };
  // Swap through a temporary slot inside one transaction because positions are unique per course.
  const positions = await db.prepare('SELECT id,position FROM learning_lessons WHERE id IN (?,?)').bind(lesson.id, other.id).all();
  const a = positions.results.find(row => row.id === lesson.id), b = positions.results.find(row => row.id === other.id);
  await db.batch([
    db.prepare('UPDATE learning_lessons SET position=? WHERE id=?').bind(1_000_000 + a.position, a.id),
    db.prepare('UPDATE learning_lessons SET position=? WHERE id=?').bind(a.position, b.id),
    db.prepare('UPDATE learning_lessons SET position=? WHERE id=?').bind(b.position, a.id),
  ]);
  await audit(db, 'course', id, 'lesson-moved');
  return { course: await getCourse(db, id) };
}

export function videoFilename(value) {
  const raw = textValue(value, 5, 140, 'Filename');
  const match = /\.(mp4|m4v|webm)$/i.exec(raw);
  if (!match) throw new HttpError(400, 'Upload an MP4 or WebM video file.');
  const stem = raw.slice(0, -match[0].length).replace(/[^a-zA-Z0-9._ -]+/g, '-').replace(/^[^a-zA-Z0-9]+/, '').slice(0, 90) || 'lesson-video';
  return { filename: `${stem}.${match[1].toLowerCase()}`, contentType: VIDEO_TYPES[match[1].toLowerCase()] };
}

export async function startVideoUpload(env, db, id, input) {
  exactFields(input, ['filename', 'sizeBytes', 'rightsConfirmed']);
  if (!env.COURSE_FILES) throw new HttpError(503, 'Private file storage is not configured.');
  draftOnly(await getCourse(db, identifier(id)));
  if (input.rightsConfirmed !== true) throw new HttpError(400, 'Confirm you own or have permission to publish this video.');
  const { filename, contentType } = videoFilename(input.filename);
  const size = input.sizeBytes;
  if (!Number.isSafeInteger(size) || size < 1024 || size > VIDEO_MAX_BYTES) throw new HttpError(413, 'Videos must be between 1 KB and 1 GB. Export a shorter or compressed MP4.');
  await quota(db, 'video-uploads', 20, 86400);
  const resourceId = crypto.randomUUID(), key = `courses/${id}/${resourceId}.${filename.split('.').at(-1)}`, partCount = Math.ceil(size / VIDEO_PART_BYTES), now = new Date().toISOString();
  const reserved = await db.prepare(`INSERT INTO learning_resources(id,course_id,kind,object_key,filename,size_bytes,status,created_at,rights_confirmed)
    SELECT ?,?,'video',?,?,?,'uploading',?,1 WHERE (SELECT COALESCE(SUM(size_bytes),0) FROM learning_resources) + ? <= ? RETURNING id`)
    .bind(resourceId, id, key, filename, size, now, size, storageLimit(env)).first();
  if (!reserved) throw new HttpError(409, 'The course file-storage budget has been reached. Remove unused files or contact the operator before increasing it.');
  let upload;
  try { upload = await env.COURSE_FILES.createMultipartUpload(key, { httpMetadata: { contentType } }); }
  catch {
    await db.prepare("UPDATE learning_resources SET status='failed',size_bytes=0 WHERE id=?").bind(resourceId).run();
    throw new HttpError(503, 'Video storage could not start the upload. Please try again.');
  }
  await db.prepare('INSERT INTO learning_media_uploads(resource_id,upload_id,content_type,part_size,part_count,created_at) VALUES (?,?,?,?,?,?)')
    .bind(resourceId, upload.uploadId, contentType, VIDEO_PART_BYTES, partCount, now).run();
  await audit(db, 'resource', resourceId, 'video-upload-started');
  return { resource: { id: resourceId, kind: 'video', filename, sizeBytes: size, status: 'uploading', contentType, partCount, uploadedParts: 0 }, partSize: VIDEO_PART_BYTES };
}

async function pendingUpload(db, resourceId) {
  const row = await db.prepare(`SELECT r.id,r.course_id,r.object_key,r.size_bytes,r.status,u.upload_id,u.content_type,u.part_size,u.part_count,c.status AS course_status
    FROM learning_resources r JOIN learning_media_uploads u ON u.resource_id=r.id JOIN learning_courses c ON c.id=r.course_id WHERE r.id=?`).bind(identifier(resourceId)).first();
  if (!row) throw new HttpError(404, 'Upload not found.');
  if (row.status !== 'uploading' || row.course_status !== 'draft') throw new HttpError(409, 'This upload is already finished or its course is no longer a draft.');
  return row;
}

const looksLikeVideo = (bytes, type) => type === 'video/webm'
  ? bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3
  : new TextDecoder().decode(bytes.slice(4, 8)) === 'ftyp';

export async function uploadVideoPart(request, env, db, resourceId, partText) {
  if (!env.COURSE_FILES) throw new HttpError(503, 'Private file storage is not configured.');
  await quota(db, 'video-parts', 1500, 3600);
  const row = await pendingUpload(db, resourceId);
  if (!/^\d{1,5}$/.test(partText) || Number(partText) < 1 || Number(partText) > row.part_count) throw new HttpError(400, 'Invalid upload part.');
  const part = Number(partText), expected = part < row.part_count ? row.part_size : row.size_bytes - row.part_size * (row.part_count - 1);
  if (request.headers.get('content-type') !== 'application/octet-stream' || request.headers.has('content-encoding')) throw new HttpError(415, 'Send the video part as raw bytes.');
  const wrongSize = () => new HttpError(400, 'This part has the wrong size. Choose the same file you started uploading.');
  const declared = request.headers.get('content-length');
  if (declared !== null && declared !== String(expected)) throw wrongSize();
  const reader = request.body?.getReader();
  if (!reader) throw wrongSize();
  // Read into a fixed buffer so a chunked body can never grow past the expected part size.
  const bytes = new Uint8Array(expected); let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (size + value.length > expected) { await reader.cancel(); throw wrongSize(); }
      bytes.set(value, size); size += value.length;
    }
  } finally { reader.releaseLock(); }
  if (size !== expected) throw wrongSize();
  if (part === 1 && !looksLikeVideo(bytes, row.content_type)) throw new HttpError(400, 'This file does not look like an MP4 or WebM video.');
  let uploaded;
  try { uploaded = await env.COURSE_FILES.resumeMultipartUpload(row.object_key, row.upload_id).uploadPart(part, bytes); }
  catch { throw new HttpError(503, 'This part did not reach storage. Retry the upload; finished parts are kept.'); }
  await db.prepare(`INSERT INTO learning_upload_parts(resource_id,part_number,etag,size_bytes) VALUES (?,?,?,?)
    ON CONFLICT(resource_id,part_number) DO UPDATE SET etag=excluded.etag,size_bytes=excluded.size_bytes`).bind(row.id, part, uploaded.etag, bytes.length).run();
  const count = (await db.prepare('SELECT count(*) AS count FROM learning_upload_parts WHERE resource_id=?').bind(row.id).first()).count;
  return { partNumber: part, uploadedParts: count, partCount: row.part_count };
}

export async function completeVideoUpload(env, db, resourceId) {
  const row = await pendingUpload(db, resourceId);
  const { results } = await db.prepare('SELECT part_number AS partNumber,etag,size_bytes FROM learning_upload_parts WHERE resource_id=? ORDER BY part_number').bind(row.id).all();
  const total = results.reduce((sum, item) => sum + item.size_bytes, 0);
  if (results.length !== row.part_count || total !== row.size_bytes) throw new HttpError(409, `Only ${results.length} of ${row.part_count} parts have arrived. Resume the upload with the same file.`);
  try { await env.COURSE_FILES.resumeMultipartUpload(row.object_key, row.upload_id).complete(results.map(({ partNumber, etag }) => ({ partNumber, etag }))); }
  catch {
    // Completion may have succeeded just before a database or network failure. Reconcile
    // the private object before asking the editor to retry an already-finished upload.
    let stored;
    try { stored = await env.COURSE_FILES.head(row.object_key); } catch {}
    if (!stored || stored.size !== row.size_bytes) throw new HttpError(503, 'Storage could not assemble the video. Retry finishing the upload.');
  }
  await db.batch([
    db.prepare("UPDATE learning_resources SET status='ready' WHERE id=? AND status='uploading'").bind(row.id),
    db.prepare('DELETE FROM learning_upload_parts WHERE resource_id=?').bind(row.id),
  ]);
  await audit(db, 'resource', row.id, 'video-uploaded');
  return { resource: { id: row.id, kind: 'video', status: 'ready', sizeBytes: row.size_bytes, contentType: row.content_type } };
}

export async function removeResource(env, db, resourceId) {
  const row = await db.prepare(`SELECT r.*,u.upload_id,c.status AS course_status FROM learning_resources r JOIN learning_courses c ON c.id=r.course_id
    LEFT JOIN learning_media_uploads u ON u.resource_id=r.id WHERE r.id=?`).bind(identifier(resourceId)).first();
  if (!row) throw new HttpError(404, 'File not found.');
  if (row.course_status !== 'draft') throw new HttpError(409, 'Files can only be removed from draft courses.');
  if (await db.prepare('SELECT 1 FROM learning_lessons WHERE resource_id=?').bind(row.id).first()) throw new HttpError(409, 'A lesson still uses this file. Remove or change that lesson first.');
  if (row.object_key && env.COURSE_FILES) {
    try {
      if (row.status === 'uploading' && row.upload_id) await env.COURSE_FILES.resumeMultipartUpload(row.object_key, row.upload_id).abort();
      else await env.COURSE_FILES.delete(row.object_key);
    } catch (error) {
      if (row.status !== 'uploading' || !missingMultipartUpload(error))
        throw new HttpError(503, 'Storage could not remove this file. Nothing was changed; try again.');
      // R2 may expire unfinished multipart uploads itself. A completed object can also
      // outlive a failed DB update, so remove it before releasing the reservation.
      let stored;
      try { stored = await env.COURSE_FILES.head(row.object_key); }
      catch { throw new HttpError(503, 'Storage could not confirm this file was removed. Try again.'); }
      if (stored) {
        try { await env.COURSE_FILES.delete(row.object_key); }
        catch { throw new HttpError(503, 'Storage could not remove this file. Nothing was changed; try again.'); }
      }
    }
  }
  // Deleting the ledger row releases its storage reservation; the media/part rows cascade.
  await db.prepare('DELETE FROM learning_resources WHERE id=?').bind(row.id).run();
  await audit(db, 'resource', row.id, 'removed');
  return { removed: true };
}

const hexEqual = (a, b) => { if (a.length !== b.length) return false; let diff = 0; for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i); return diff === 0; };

// Video elements cannot send the in-memory Firebase/admin bearer token, so access is a short-lived
// HMAC-signed path. Anyone holding the path can play it until it expires; it is access control, not DRM.
export async function signedMediaPath(env, resourceId, audience) {
  if (!configuredSecret(env.SECURITY_SALT)) throw new HttpError(503, 'Protected video playback is not configured.');
  const expires = Math.floor(Date.now() / 1000) + MEDIA_TTL;
  const signature = await hmacHex(env.SECURITY_SALT, `course-media-v1:${resourceId}:${audience}:${expires}`);
  return { url: `/api/v2/media/${resourceId}/${audience}/${expires}/${signature}`, expiresAt: expires };
}

export async function serveMedia(request, env, db, parts) {
  const [resourceId, audience, expiresText, signature] = parts;
  const now = Math.floor(Date.now() / 1000), expires = Number(expiresText);
  if (!configuredSecret(env.SECURITY_SALT) || !env.COURSE_FILES) throw new HttpError(503, 'Protected video playback is not configured.');
  if (!['l', 's'].includes(audience) || !/^\d{10}$/.test(expiresText) || !/^[a-f0-9]{64}$/.test(signature)) throw new HttpError(404, 'Video not found.');
  const expected = await hmacHex(env.SECURITY_SALT, `course-media-v1:${identifier(resourceId)}:${audience}:${expiresText}`);
  if (!hexEqual(expected, signature)) throw new HttpError(404, 'Video not found.');
  if (expires < now || expires > now + MEDIA_TTL + 60) throw new HttpError(403, 'This video link has expired. Press play again to refresh it.');
  const row = await db.prepare(`SELECT r.object_key,r.size_bytes,r.course_id,u.content_type,c.status AS course_status FROM learning_resources r
    JOIN learning_media_uploads u ON u.resource_id=r.id JOIN learning_courses c ON c.id=r.course_id WHERE r.id=? AND r.kind='video' AND r.status='ready'`).bind(resourceId).first();
  if (!row) throw new HttpError(404, 'Video not found.');
  if (audience === 'l' && (!['published', 'archived'].includes(row.course_status) || !await db.prepare('SELECT 1 FROM learning_lessons WHERE resource_id=? AND course_id=?').bind(resourceId, row.course_id).first())) throw new HttpError(404, 'Video not found.');
  const size = row.size_bytes, header = request.headers.get('range');
  let offset = 0, length = size, partial = false;
  const range = header && /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (range && (range[1] || range[2])) {
    if (range[1]) { offset = Number(range[1]); const end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1; length = end - offset + 1; }
    else { length = Math.min(Number(range[2]), size); offset = size - length; }
    if (offset >= size || length <= 0) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
    partial = true;
  }
  const object = request.method === 'HEAD' ? null : await env.COURSE_FILES.get(row.object_key, partial ? { range: { offset, length } } : undefined);
  if (request.method !== 'HEAD' && !object) throw new HttpError(404, 'Video not found.');
  const headers = { 'Content-Type': row.content_type, 'Content-Length': String(length), 'Accept-Ranges': 'bytes', 'Content-Disposition': 'inline', 'Cache-Control': 'private, no-store' };
  if (partial) headers['Content-Range'] = `bytes ${offset}-${offset + length - 1}/${size}`;
  return new Response(object ? object.body : null, { status: partial ? 206 : 200, headers });
}
