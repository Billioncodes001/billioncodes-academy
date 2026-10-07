import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { post, admin, ORIGIN, SALT } from './harness.mjs';
import { setup } from './platform-harness.mjs';
import { completeVideoUpload, removeResource } from '../studio.js';

const PART = 8 * 1024 * 1024;
const course = { id:'python-basics', title:'Python basics', summary:'Short video lessons that teach Python from the very beginning.', level:'Beginner', priceMinor:0 };
const staff = (path, data, method = 'POST') => [path, { ...post(data, undefined, admin()), method }];
async function ok(h, path, init) {
  const response = await h.fetch(path, init);
  assert.equal(response.status, 200, `${init?.method || 'GET'} ${path}: ${await response.clone().text()}`);
  return response.json();
}
function fakeMp4(size) {
  const bytes = Buffer.alloc(size);
  for (let i = 0; i < size; i += 4096) bytes[i] = i % 251;
  bytes.writeUInt32BE(32, 0); bytes.write('ftypisom', 4, 'latin1');
  return bytes;
}
const sendPart = (h, id, number, body, headers = {}) => h.fetch(`/api/v2/staff/resources/${id}/parts/${number}`, { method:'PUT', headers:{ ...admin(), Origin:ORIGIN, 'Content-Type':'application/octet-stream', ...headers }, body });

test('draft course details and lessons can be edited, reordered and removed only while draft', async t => {
  const h = await setup(t), ada = await h.register();
  let value = await ok(h, ...staff('/api/v2/staff/courses', course));
  const text = 'Python reads like plain English, which makes it a friendly first language for new programmers.';
  await ok(h, ...staff(`/api/v2/staff/courses/${course.id}/lessons`, { title:'Welcome', kind:'text', body:text, section:'Getting started' }));
  await ok(h, ...staff(`/api/v2/staff/courses/${course.id}/lessons`, { title:'Variables', kind:'text', body:text, section:'Core skills' }));
  value = await ok(h, ...staff(`/api/v2/staff/courses/${course.id}/lessons`, { title:'Install Python', kind:'text', body:text, section:'Getting started' }));
  assert.deepEqual(value.course.lessons.map(item => [item.title, item.section]), [['Welcome','Getting started'],['Variables','Core skills'],['Install Python','Getting started']]);
  const [, variables, install] = value.course.lessons;
  value = await ok(h, ...staff(`/api/v2/staff/courses/${course.id}/lessons/${install.id}/move`, { direction:'up' }));
  assert.deepEqual(value.course.lessons.map(item => item.title), ['Welcome','Install Python','Variables']);
  value = await ok(h, ...staff(`/api/v2/staff/courses/${course.id}/lessons/${variables.id}`, { title:'Variables and values', body:`${text}\n\nA second paragraph.`, section:'' }, 'PATCH'));
  assert.deepEqual(value.course.lessons[2].body, [text, 'A second paragraph.']);
  assert.equal(value.course.lessons[2].section, '');
  value = await ok(h, `/api/v2/staff/courses/${course.id}/lessons/${install.id}`, { method:'DELETE', headers:{ ...admin(), Origin:ORIGIN } });
  assert.equal(value.course.lessons.length, 2);
  const { id, ...details } = course;
  assert.equal((await h.fetch(...staff(`/api/v2/staff/courses/${course.id}`, { ...course, version:1 }, 'PATCH'))).status, 400, 'identifier cannot be changed');
  assert.equal((await h.fetch(...staff(`/api/v2/staff/courses/${course.id}`, { ...details, title:'Python basics, stale', version:9 }, 'PATCH'))).status, 409);
  value = await ok(h, ...staff(`/api/v2/staff/courses/${course.id}`, { ...details, title:'Python for beginners', version:1 }, 'PATCH'));
  assert.equal(value.course.version, 2);
  await ok(h, ...staff(`/api/v2/staff/courses/${course.id}/publish`, { version:2 }));
  const learner = await ok(h, `/api/v2/courses/${course.id}`);
  assert.equal(learner.course.title, 'Python for beginners');
  assert.deepEqual(learner.course.lessons.map(item => item.section), ['Getting started', '']);
  assert.equal(learner.course.lessons[0].body, undefined);
  assert.equal((await h.fetch(...staff(`/api/v2/staff/courses/${course.id}/lessons/${variables.id}`, { title:'Too late', body:text }, 'PATCH'))).status, 409);
  value = await ok(h, ...staff(`/api/v2/staff/courses/${course.id}/draft`, { version:3 }));
  assert.equal(value.course.status, 'draft');
  await ok(h, ...staff(`/api/v2/staff/courses/${course.id}/publish`, { version:4 }));
  await ok(h, `/api/v2/courses/${course.id}/enrol`, post({}, undefined, ada));
  assert.equal((await h.fetch(...staff(`/api/v2/staff/courses/${course.id}/draft`, { version:5 }))).status, 409);
  const audit = await h.db.prepare("SELECT action FROM learning_audit WHERE entity_id=? ORDER BY id").bind(course.id).all();
  assert.ok(['lesson-moved','lesson-updated','lesson-removed','details-updated','returned-to-draft'].every(action => audit.results.some(row => row.action === action)));
});

test('chunked R2 video upload becomes an enrolled-only lesson streamed with signed byte ranges', async t => {
  const h = await setup(t), ada = await h.register(), ben = await h.register('ben');
  await ok(h, ...staff('/api/v2/staff/courses', course));
  const video = fakeMp4(PART + 5000);
  assert.equal((await h.fetch(...staff(`/api/v2/staff/courses/${course.id}/video-uploads`, { filename:'intro.mov', sizeBytes:video.length, rightsConfirmed:true }))).status, 400);
  assert.equal((await h.fetch(...staff(`/api/v2/staff/courses/${course.id}/video-uploads`, { filename:'intro.mp4', sizeBytes:video.length, rightsConfirmed:false }))).status, 400);
  const started = await ok(h, ...staff(`/api/v2/staff/courses/${course.id}/video-uploads`, { filename:'Lesson 1 (final!).mp4', sizeBytes:video.length, rightsConfirmed:true }));
  const resource = started.resource;
  assert.equal(resource.filename, 'Lesson 1 -final-.mp4');
  assert.equal(started.partSize, PART); assert.equal(resource.partCount, 2);
  assert.equal((await sendPart(h, resource.id, 1, Buffer.alloc(PART, 7))).status, 400, 'non-video first part rejected');
  assert.equal((await sendPart(h, resource.id, 2, video.subarray(PART, PART + 10))).status, 400, 'wrong part size rejected');
  assert.equal((await sendPart(h, resource.id, 3, video.subarray(PART))).status, 400);
  assert.equal((await h.fetch(`/api/v2/staff/resources/${resource.id}/parts/1`, { method:'PUT', headers:{ Origin:ORIGIN, 'Content-Type':'application/octet-stream' }, body:video.subarray(0, PART) })).status, 401);
  { const r = await sendPart(h, resource.id, 2, video.subarray(PART)); assert.equal(r.status, 200, await r.clone().text()); }
  assert.equal((await h.fetch(...staff(`/api/v2/staff/resources/${resource.id}/complete`, {}))).status, 409, 'cannot finish with a missing part');
  const detail = await ok(h, `/api/v2/staff/courses/${course.id}`, { headers:admin() });
  assert.equal(detail.resources[0].uploadedParts, 1);
  assert.equal((await sendPart(h, resource.id, 1, video.subarray(0, PART))).status, 200);
  const done = await ok(h, ...staff(`/api/v2/staff/resources/${resource.id}/complete`, {}));
  assert.equal(done.resource.status, 'ready');

  const preview = await ok(h, ...staff(`/api/v2/staff/resources/${resource.id}/preview`, {}));
  assert.match(preview.url, /^\/api\/v2\/media\/[a-z0-9-]+\/s\/\d{10}\/[a-f0-9]{64}$/);
  const staffFile = await h.fetch(preview.url);
  assert.equal(staffFile.status, 200); assert.equal(staffFile.headers.get('content-type'), 'video/mp4');
  assert.ok(Buffer.from(await staffFile.arrayBuffer()).equals(video), 'reassembled object matches the original upload');
  const learnerSigned = preview.url.replace('/s/', '/l/');
  assert.equal((await h.fetch(learnerSigned)).status, 404, 'audience is part of the signature');

  await ok(h, ...staff(`/api/v2/staff/courses/${course.id}/lessons`, { title:'Welcome to Python', kind:'video', resourceId:resource.id, body:'Download Python before the next lesson.', section:'Getting started' }));
  assert.equal((await h.fetch(...staff(`/api/v2/staff/resources/${resource.id}`, {}, 'DELETE'))).status, 409, 'files used by a lesson are kept');
  await ok(h, ...staff(`/api/v2/staff/courses/${course.id}/publish`, { version:1 }));
  await ok(h, `/api/v2/courses/${course.id}/enrol`, post({}, undefined, ada));
  assert.equal((await h.fetch(`/api/v2/resources/${resource.id}/playback`, post({}, undefined, ben))).status, 404);
  const playback = await ok(h, `/api/v2/resources/${resource.id}/playback`, post({}, undefined, ada));
  assert.equal(playback.kind, 'file');
  const ranged = await h.fetch(playback.url, { headers:{ Range:'bytes=0-99' } });
  assert.equal(ranged.status, 206);
  assert.equal(ranged.headers.get('content-range'), `bytes 0-99/${video.length}`);
  assert.equal(ranged.headers.get('cache-control'), 'no-store');
  assert.ok(Buffer.from(await ranged.arrayBuffer()).equals(video.subarray(0, 100)));
  const tail = await h.fetch(playback.url, { headers:{ Range:`bytes=${PART}-` } });
  assert.equal(tail.status, 206);
  assert.ok(Buffer.from(await tail.arrayBuffer()).equals(video.subarray(PART)));
  const suffix = await h.fetch(playback.url, { headers:{ Range:'bytes=-10' } });
  assert.ok(Buffer.from(await suffix.arrayBuffer()).equals(video.subarray(-10)));
  assert.equal((await h.fetch(playback.url, { headers:{ Range:`bytes=${video.length}-` } })).status, 416);
  const tampered = playback.url.replace(/[a-f0-9]$/, c => c === '0' ? '1' : '0');
  assert.equal((await h.fetch(tampered)).status, 404);
  const past = Math.floor(Date.now() / 1000) - 10;
  const expiredSignature = createHmac('sha256', SALT).update(`course-media-v1:${resource.id}:l:${past}`).digest('hex');
  assert.equal((await h.fetch(`/api/v2/media/${resource.id}/l/${past}/${expiredSignature}`)).status, 403);
  assert.equal((await h.fetch(playback.url, { method:'POST', headers:{ Origin:ORIGIN } })).status, 405);
});

test('storage reservations are bounded and cancelling an unfinished upload releases them', async t => {
  const h = await setup(t);
  await ok(h, ...staff('/api/v2/staff/courses', course));
  const gb = 1024 * 1024 * 1024;
  const start = () => h.fetch(...staff(`/api/v2/staff/courses/${course.id}/video-uploads`, { filename:'long-recording.mp4', sizeBytes:900 * 1024 * 1024, rightsConfirmed:true }));
  assert.equal((await h.fetch(...staff(`/api/v2/staff/courses/${course.id}/video-uploads`, { filename:'huge.mp4', sizeBytes:gb + 1, rightsConfirmed:true }))).status, 413);
  const first = await start(); assert.equal(first.status, 200);
  assert.equal((await start()).status, 200);
  assert.equal((await start()).status, 409, 'default 2 GB ledger budget is enforced');
  const { resource } = await first.json();
  const removed = await h.fetch(`/api/v2/staff/resources/${resource.id}`, { method:'DELETE', headers:{ ...admin(), Origin:ORIGIN } });
  assert.equal(removed.status, 200, await removed.clone().text());
  assert.equal((await h.db.prepare('SELECT count(*) AS count FROM learning_media_uploads WHERE resource_id=?').bind(resource.id).first()).count, 0);
  assert.equal((await start()).status, 200, 'cancelled reservation was released');
});


test('expired multipart cancellation releases its reservation and finished upload retries reconcile the object', async t => {
  const h = await setup(t);
  const bucket = await h.mf.getR2Bucket('COURSE_FILES');
  const env = { COURSE_FILES: bucket };
  await ok(h, ...staff('/api/v2/staff/courses', course));

  const stale = await ok(h, ...staff(`/api/v2/staff/courses/${course.id}/video-uploads`, { filename:'stale.mp4', sizeBytes:PART, rightsConfirmed:true }));
  const staleRow = await h.db.prepare('SELECT r.object_key,u.upload_id FROM learning_resources r JOIN learning_media_uploads u ON u.resource_id=r.id WHERE r.id=?').bind(stale.resource.id).first();
  await bucket.resumeMultipartUpload(staleRow.object_key, staleRow.upload_id).abort();
  assert.deepEqual(await removeResource(env, h.db, stale.resource.id), { removed:true });
  assert.equal(await h.db.prepare('SELECT id FROM learning_resources WHERE id=?').bind(stale.resource.id).first(), null);

  const bytes = fakeMp4(PART);
  const active = await ok(h, ...staff(`/api/v2/staff/courses/${course.id}/video-uploads`, { filename:'retry.mp4', sizeBytes:bytes.length, rightsConfirmed:true }));
  await ok(h, `/api/v2/staff/resources/${active.resource.id}/parts/1`, { method:'PUT', headers:{ ...admin(), Origin:ORIGIN, 'Content-Type':'application/octet-stream' }, body:bytes });
  const row = await h.db.prepare('SELECT r.object_key,u.upload_id FROM learning_resources r JOIN learning_media_uploads u ON u.resource_id=r.id WHERE r.id=?').bind(active.resource.id).first();
  const parts = await h.db.prepare('SELECT part_number,etag FROM learning_upload_parts WHERE resource_id=?').bind(active.resource.id).all();
  await bucket.resumeMultipartUpload(row.object_key, row.upload_id).complete(parts.results.map(part => ({ partNumber:part.part_number, etag:part.etag })));
  const done = await completeVideoUpload(env, h.db, active.resource.id);
  assert.equal(done.resource.status, 'ready');
  assert.equal((await h.db.prepare('SELECT status FROM learning_resources WHERE id=?').bind(active.resource.id).first()).status, 'ready');
});
