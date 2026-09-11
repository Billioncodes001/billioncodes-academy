import { HttpError, readJSON } from './validation.js';
import { authenticateAdmin, checkOrigin } from './security.js';
import { database } from './storage.js';
import { identityReady, platformEnabled, firebaseConfig, identitySession, requireLearner, publicUser, quota, exactFields } from './identity.js';
import { courseCatalogue, courseForLearner, enrol, library, saveProgress, createCourse, addLesson, publishCourse, uploadPDF, resourceForLearner, downloadPDF, registerVideo, videoPlayback, getCourse, identifier } from './learning.js';
import { cohorts, myApplications, saveApplication, withdrawApplication, saveCohort, applicationsForStaff, reviewApplication } from './training.js';

const json = value => Response.json(value);
const method = (request, expected) => { if (request.method !== expected) throw new HttpError(405, `Use ${expected}.`, undefined, { Allow:expected }); };

export async function platformRoute(request, env, url) {
  const path = url.pathname;
  if (path === '/api/v2/platform') {
    method(request,'GET');
    return json({ enabled:platformEnabled(env), accountsReady:identityReady(env), firebase:identityReady(env) ? firebaseConfig(env) : null, pdfStorageReady:!!env.COURSE_FILES, videoReady:!!env.STREAM_API_TOKEN, checkoutEnabled:false });
  }
  if (!platformEnabled(env)) throw new HttpError(503, 'The learning platform is not active yet.');
  if (url.search) throw new HttpError(400, 'URL parameters are not accepted.');
  checkOrigin(request, env, request.method !== 'GET');
  const db = database(env);
  if (path.startsWith('/api/v2/staff/')) {
    await authenticateAdmin(request, env);
    await quota(db,'staff',500,3600);
    const tail = path.slice('/api/v2/staff/'.length).split('/');
    if (tail[0] === 'courses' && tail.length === 1) {
      if (request.method === 'GET') return json(await courseCatalogue(db,true));
      method(request,'POST'); return json(await createCourse(db,await readJSON(request)));
    }
    if (tail[0] === 'courses' && tail.length === 2) {
      method(request,'GET');
      const course = await getCourse(db,identifier(tail[1]));
      const { results } = await db.prepare('SELECT id,kind,filename,size_bytes AS sizeBytes,status FROM learning_resources WHERE course_id=? ORDER BY created_at DESC LIMIT 100').bind(tail[1]).all();
      return json({ course, resources:results });
    }
    if (tail[0] === 'courses' && tail.length === 3) {
      method(request,'POST');
      if (tail[2] === 'lessons') return json(await addLesson(db,tail[1],await readJSON(request)));
      if (tail[2] === 'publish') return json(await publishCourse(db,tail[1],await readJSON(request)));
      if (tail[2] === 'pdf') return json(await uploadPDF(request,env,db,tail[1]));
      if (tail[2] === 'video') return json(await registerVideo(env,db,tail[1],await readJSON(request)));
    }
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
