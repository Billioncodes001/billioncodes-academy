import { HttpError, readJSON } from './validation.js';
import { checkOrigin } from './security.js';
import { requireStaff } from './staff.js';
import { database } from './storage.js';
import { identityReady, platformEnabled, firebaseConfig, identitySession, requireLearner, publicUser, quota, exactFields } from './identity.js';
import { courseCatalogue, courseForLearner, enrol, library, saveProgress, createCourse, addLesson, publishCourse, uploadPDF, resourceForLearner, downloadPDF, registerVideo, videoPlayback, identifier } from './learning.js';
import { staffCourse, updateCourse, returnToDraft, updateLesson, deleteLesson, moveLesson, startVideoUpload, uploadVideoPart, completeVideoUpload, removeResource, signedMediaPath, serveMedia } from './studio.js';
import { cohorts, myApplications, saveApplication, withdrawApplication, saveCohort, applicationsForStaff, reviewApplication } from './training.js';

const json = value => Response.json(value);
const method = (request, expected) => { if (request.method !== expected) throw new HttpError(405, `Use ${expected}.`, undefined, { Allow:expected }); };

export async function platformRoute(request, env, url) {
  const path = url.pathname;
  if (path === '/api/v2/platform') {
    method(request,'GET');
    return json({ enabled:platformEnabled(env), accountsReady:identityReady(env), firebase:identityReady(env) ? firebaseConfig(env) : null, pdfStorageReady:!!env.COURSE_FILES, videoReady:!!env.COURSE_FILES || !!env.STREAM_API_TOKEN, checkoutEnabled:false });
  }
  if (!platformEnabled(env)) throw new HttpError(503, 'The learning platform is not active yet.');
  if (url.search) throw new HttpError(400, 'URL parameters are not accepted.');
  checkOrigin(request, env, !['GET','HEAD'].includes(request.method));
  const db = database(env);
  const media = /^\/api\/v2\/media\/([a-z0-9-]+)\/([a-z])\/(\d+)\/([a-f0-9]+)$/.exec(path);
  if (media) {
    if (!['GET','HEAD'].includes(request.method)) throw new HttpError(405, 'Use GET.', undefined, { Allow:'GET, HEAD' });
    return serveMedia(request, env, db, media.slice(1));
  }
  if (path.startsWith('/api/v2/staff/')) {
    const tail = path.slice('/api/v2/staff/'.length).split('/');
    // Editors run the course studio; reviewers handle training cohorts and applications.
    await requireStaff(request, env, ['cohorts','applications'].includes(tail[0]) ? 'training' : 'studio');
    // Video parts have their own hourly budget so one long upload does not lock the rest of the studio.
    if (!(tail[0] === 'resources' && tail[2] === 'parts')) await quota(db,'staff',500,3600);
    if (tail[0] === 'courses' && tail.length === 1) {
      if (request.method === 'GET') return json(await courseCatalogue(db,true));
      method(request,'POST'); return json(await createCourse(db,await readJSON(request)));
    }
    if (tail[0] === 'courses' && tail.length === 2) {
      if (request.method === 'PATCH') return json(await updateCourse(db,tail[1],await readJSON(request)));
      method(request,'GET');
      return json(await staffCourse(env,db,tail[1]));
    }
    if (tail[0] === 'courses' && tail.length === 3) {
      method(request,'POST');
      if (tail[2] === 'lessons') return json(await addLesson(db,tail[1],await readJSON(request)));
      if (tail[2] === 'publish') return json(await publishCourse(db,tail[1],await readJSON(request)));
      if (tail[2] === 'draft') return json(await returnToDraft(db,tail[1],await readJSON(request)));
      if (tail[2] === 'pdf') return json(await uploadPDF(request,env,db,tail[1]));
      if (tail[2] === 'video') return json(await registerVideo(env,db,tail[1],await readJSON(request)));
      if (tail[2] === 'video-uploads') return json(await startVideoUpload(env,db,tail[1],await readJSON(request)));
    }
    if (tail[0] === 'courses' && tail[2] === 'lessons' && tail.length === 4) {
      if (request.method === 'DELETE') return json(await deleteLesson(db,tail[1],tail[3]));
      method(request,'PATCH'); return json(await updateLesson(db,tail[1],tail[3],await readJSON(request)));
    }
    if (tail[0] === 'courses' && tail[2] === 'lessons' && tail[4] === 'move' && tail.length === 5) { method(request,'POST'); return json(await moveLesson(db,tail[1],tail[3],await readJSON(request))); }
    if (tail[0] === 'resources' && tail.length === 2) { method(request,'DELETE'); return json(await removeResource(env,db,tail[1])); }
    if (tail[0] === 'resources' && tail.length === 3) {
      method(request,'POST');
      if (tail[2] === 'complete') { exactFields(await readJSON(request),[]); return json(await completeVideoUpload(env,db,tail[1])); }
      if (tail[2] === 'preview') {
        exactFields(await readJSON(request),[]);
        const resource = await db.prepare("SELECT id FROM learning_resources WHERE id=? AND kind='video' AND status='ready' AND object_key IS NOT NULL").bind(identifier(tail[1])).first();
        if (!resource) throw new HttpError(404,'Video not found or still uploading.');
        return json(await signedMediaPath(env,resource.id,'s'));
      }
    }
    if (tail[0] === 'resources' && tail[2] === 'parts' && tail.length === 4) { method(request,'PUT'); return json(await uploadVideoPart(request,env,db,tail[1],tail[3])); }
    if (tail[0] === 'cohorts' && tail.length === 1) {
      if (request.method === 'GET') return json(await cohorts(db));
      method(request,'POST'); return json(await saveCohort(db,await readJSON(request)));
    }
    if (tail[0] === 'applications' && tail.length === 1) { method(request,'GET'); return json(await applicationsForStaff(db)); }
    if (tail[0] === 'applications' && tail.length === 2) { method(request,'PATCH'); return json(await reviewApplication(db,tail[1],await readJSON(request))); }
    throw new HttpError(404,'Staff endpoint not found.');
  }
  if (path === '/api/v2/courses') { method(request,'GET'); return json(await courseCatalogue(db)); }
  if (path === '/api/v2/cohorts') { method(request,'GET'); return json(await cohorts(db)); }
  if (path === '/api/v2/account') {
    method(request,'GET');
    if (!identityReady(env)) return json({ user:null });
    const value = await identitySession(request,env);
    return json({ user:value ? publicUser(value.user) : null });
  }
  const coursePath = /^\/api\/v2\/courses\/([a-z0-9-]+)$/.exec(path);
  if (coursePath) {
    method(request,'GET');
    const value = identityReady(env) ? await identitySession(request,env) : null;
    return json(await courseForLearner(db,value?.user,coursePath[1]));
  }
  const user = await requireLearner(request,env);
  if (request.method !== 'GET') await quota(db,`member:${user.id}`,120,600);
  if (path === '/api/v2/library') { method(request,'GET'); return json(await library(db,user)); }
  const enrolPath = /^\/api\/v2\/courses\/([a-z0-9-]+)\/enrol$/.exec(path);
  if (enrolPath) { method(request,'POST'); exactFields(await readJSON(request),[]); return json(await enrol(db,user,enrolPath[1])); }
  const progressPath = /^\/api\/v2\/courses\/([a-z0-9-]+)\/lessons\/([a-z0-9-]+)\/progress$/.exec(path);
  if (progressPath) { method(request,'PUT'); return json(await saveProgress(db,user,progressPath[1],progressPath[2],await readJSON(request))); }
  if (path === '/api/v2/training/applications') { method(request,'GET'); return json(await myApplications(db,user)); }
  const apply = /^\/api\/v2\/training\/cohorts\/([a-z0-9-]+)\/application$/.exec(path);
  if (apply) { method(request,'PUT'); return json(await saveApplication(db,user,apply[1],await readJSON(request))); }
  const withdraw = /^\/api\/v2\/training\/applications\/([a-z0-9-]+)\/withdraw$/.exec(path);
  if (withdraw) { method(request,'POST'); return json(await withdrawApplication(db,user,withdraw[1],await readJSON(request))); }
  const resourcePath = /^\/api\/v2\/resources\/([a-z0-9-]+)(\/playback)?$/.exec(path);
  if (resourcePath) {
    method(request, resourcePath[2] ? 'POST' : 'GET');
    const resource = await resourceForLearner(db,user,resourcePath[1]);
    return resourcePath[2] ? json(await videoPlayback(env,resource)) : downloadPDF(env,resource);
  }
  throw new HttpError(404,'Learning endpoint not found.');
}
