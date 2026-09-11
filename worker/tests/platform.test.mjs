import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, exportJWK, SignJWT, decodeJwt } from 'jose';
import { createHarness, post, admin, ORIGIN, application } from './harness.mjs';

const projectId = 'billion-codes-academy';
async function setup(t) {
  const pair = await generateKeyPair('RS256'), jwk = await exportJWK(pair.publicKey);
  jwk.kid = 'local-test-key'; jwk.alg = 'RS256'; jwk.use = 'sig';
  const state = { disabled: false, revoked: false, outage: false };
  const h = await createHarness({ LEARNING_PLATFORM:'enabled', FIREBASE_PROJECT_ID:projectId, FIREBASE_API_KEY:'local-test-public-api-key-not-a-secret', FIREBASE_APP_ID:'local-app' }, {
    r2Buckets:{COURSE_FILES:'test-course-files'},
    outboundService: async request => {
      const url = new URL(request.url);
      if (url.hostname === 'www.googleapis.com') return Response.json({keys:[jwk]});
      if (url.hostname === 'identitytoolkit.googleapis.com') {
        if (state.outage) return new Response('',{status:503});
        const payload = decodeJwt((await request.json()).idToken);
        return Response.json({users:[{localId:payload.sub,email:payload.email,emailVerified:true,displayName:'Ada Learner',disabled:state.disabled,validSince:state.revoked ? Math.floor(Date.now()/1000)+1 : 0}]});
      }
      throw new Error('Unexpected outbound host');
    }
  });
  t.after(() => h.close());
  async function token(uid='ada', extra={}) {
    const now = Math.floor(Date.now()/1000);
    return new SignJWT({email:`${uid}@example.com`,email_verified:true,auth_time:now,firebase:{sign_in_provider:'google.com'},...extra})
      .setProtectedHeader({alg:'RS256',kid:'local-test-key'}).setSubject(uid).setAudience(projectId).setIssuer(`https://securetoken.google.com/${projectId}`).setIssuedAt(now).setExpirationTime(extra.exp || now+3600).sign(pair.privateKey);
  }
  const bearer = await token();
  const headers = {Authorization:`Bearer ${bearer}`};
  async function register(uid='ada') {
    const value = await token(uid);
    const response = await h.fetch('/api/auth/register',post({name:`${uid} Learner`,consent:true},undefined,{Authorization:`Bearer ${value}`}));
    assert.equal(response.status,200,await response.clone().text());
    return {Authorization:`Bearer ${value}`};
  }
  return {...h,headers,token,register,state};
}
test('Firebase registration verifies signed identity, consent, and rejects arbitrary roles',async t => {
  const h = await setup(t);
  assert.equal((await h.fetch('/api/health')).status,200);
  assert.equal((await h.fetch('/api/v2/library')).status,401);
  assert.equal((await h.fetch('/api/v1/applications',post(application()))).status,401);
  assert.equal((await h.fetch('/api/auth/register',post({name:'Ada Learner',consent:false},undefined,h.headers))).status,400);
  assert.equal((await h.fetch('/api/auth/register',post({name:'Ada Learner',consent:true,role:'admin'},undefined,h.headers))).status,400);
  const header = await h.register();
  const account = await h.fetch('/api/v2/account',{headers:header});
  assert.equal(account.headers.get('cache-control'),'no-store');
  assert.deepEqual((await account.json()).user,{id:'ada',name:'ada Learner',email:'ada@example.com'});
  await h.register();
  assert.equal((await h.db.prepare('SELECT count(*) AS count FROM learner_users').first()).count,1);
  assert.equal((await h.fetch('/api/v2/staff/courses',{headers:header})).status,401);
  const evil = post({name:'Ada Learner',consent:true},undefined,{...header,Origin:'https://evil.example'});
  assert.equal((await h.fetch('/api/auth/register',evil)).status,403);
  assert.equal((await h.fetch('/api/auth/email-otp/send-verification-otp',post({}))).status,404);
});
test('expired, unverified, future, wrong-provider, forged, disabled and revoked identities fail closed',async t => {
  const h = await setup(t); await h.register();
  for (const extra of [{exp:1},{email_verified:false},{auth_time:Math.floor(Date.now()/1000)+3600},{firebase:{sign_in_provider:'password'}}]) {
    assert.equal((await h.fetch('/api/v2/library',{headers:{Authorization:`Bearer ${await h.token('ada',extra)}`}})).status,401);
  }
  const forged = `${await h.token()}bad`;
  assert.equal((await h.fetch('/api/v2/library',{headers:{Authorization:`Bearer ${forged}`}})).status,401);
  h.state.disabled = true; assert.equal((await h.fetch('/api/v2/library',{headers:h.headers})).status,401);
  h.state.disabled = false; h.state.revoked = true; assert.equal((await h.fetch('/api/v2/library',{headers:h.headers})).status,401);
  h.state.revoked = false; h.state.outage = true; assert.equal((await h.fetch('/api/v2/library',{headers:h.headers})).status,503);
  h.state.outage = false;
  await h.db.prepare('UPDATE learner_users SET disabled=1 WHERE id=?').bind('ada').run();
  assert.equal((await h.fetch('/api/v2/library',{headers:h.headers})).status,403);
});
test('free library and progress are isolated by verified uid, not supplied email or user id',async t => {
  const h = await setup(t), ada = await h.register(), ben = await h.register('ben');
  const courseId = 'web-foundations-intro';
  const before = await (await h.fetch(`/api/v2/courses/${courseId}`)).json();
  assert.equal(before.enrolled,false); assert.equal(before.course.lessons[0].body,undefined);
  assert.match(before.course.summary,/Sign in to save your progress/);
  for (let i=0;i<2;i++) assert.equal((await h.fetch(`/api/v2/courses/${courseId}/enrol`,post({},undefined,ada))).status,200);
  const lesson = before.course.lessons[0].id;
  const progress = {...post({completed:true},undefined,ada),method:'PUT'};
  assert.equal((await h.fetch(`/api/v2/courses/${courseId}/lessons/${lesson}/progress`,progress)).status,200);
  const library = await (await h.fetch('/api/v2/library',{headers:ada})).json();
  assert.equal(library.courses.length,1); assert.equal(library.courses[0].completed,1);
  assert.equal((await (await h.fetch('/api/v2/library',{headers:ben})).json()).courses.length,0);
  assert.equal((await h.fetch(`/api/v2/courses/${courseId}/lessons/${lesson}/progress`,{...progress,headers:{...progress.headers,...ben}})).status,403);
});
const draftCourse = {id:'database-practice',title:'Database practice',summary:'A practical introduction to organising useful data.',level:'Beginner',priceMinor:0};
async function createDraft(h, values={}) {
  const response = await h.fetch('/api/v2/staff/courses',post({...draftCourse,...values},undefined,admin()));
  assert.equal(response.status,200,await response.clone().text());
  return (await response.json()).course;
}
test('drafts stay private, empty publication is rejected, paid enrolment is unavailable',async t => {
  const h = await setup(t), ada = await h.register();
  await createDraft(h,{priceMinor:500000});
  assert.equal((await h.fetch(`/api/v2/courses/${draftCourse.id}`)).status,404);
  assert.equal((await h.fetch(`/api/v2/staff/courses/${draftCourse.id}/publish`,post({version:1},undefined,admin()))).status,400);
  assert.equal((await h.fetch(`/api/v2/staff/courses/${draftCourse.id}/lessons`,post({title:'First principles',kind:'text',body:'A database organises information so that it can be retrieved and changed predictably.'},undefined,admin()))).status,200);
  assert.equal((await h.fetch(`/api/v2/staff/courses/${draftCourse.id}/publish`,post({version:1},undefined,admin()))).status,200);
  assert.equal((await h.fetch(`/api/v2/courses/${draftCourse.id}/enrol`,post({},undefined,ada))).status,503);
  assert.equal((await h.db.prepare('SELECT count(*) AS count FROM learning_enrolments').first()).count,0);
});
test('R2 PDF downloads require an enrolled account and a published lesson',async t => {
  const h = await setup(t), ada = await h.register(), ben = await h.register('ben'); await createDraft(h);
  const fileHeaders = {...admin(),Origin:ORIGIN,'Content-Type':'application/pdf','X-File-Name':'lesson.pdf','X-Content-Rights':'confirmed'};
  const upload = body => h.fetch(`/api/v2/staff/courses/${draftCourse.id}/pdf`,{method:'POST',headers:fileHeaders,body});
  assert.equal((await upload('Not actually a PDF')).status,400);
  const response = await upload('%PDF-1.4\nA local test fixture.\n%%EOF');
  assert.equal(response.status,200,await response.clone().text());
  const resource = (await response.json()).resource;
  assert.equal((await h.fetch(`/api/v2/resources/${resource.id}`,{headers:ada})).status,404);
  await h.fetch(`/api/v2/staff/courses/${draftCourse.id}/lessons`,post({title:'Read the PDF',kind:'pdf',resourceId:resource.id},undefined,admin()));
  await h.fetch(`/api/v2/staff/courses/${draftCourse.id}/publish`,post({version:1},undefined,admin()));
  await h.fetch(`/api/v2/courses/${draftCourse.id}/enrol`,post({},undefined,ada));
  assert.equal((await h.fetch(`/api/v2/resources/${resource.id}`)).status,401);
  assert.equal((await h.fetch(`/api/v2/resources/${resource.id}`,{headers:ben})).status,404);
  const file = await h.fetch(`/api/v2/resources/${resource.id}`,{headers:ada});
  assert.equal(file.status,200); assert.equal(file.headers.get('content-type'),'application/pdf');
  assert.match(file.headers.get('content-disposition'),/attachment/); assert.equal(file.headers.get('cache-control'),'no-store');
  assert.match(await file.text(),/^%PDF-/);
});
test('cohorts enforce Q1/Q4, submission windows, private drafts and optimistic review',async t => {
  const h = await setup(t), ada = await h.register(), ben = await h.register('ben');
  const now = new Date(), year = now.getUTCFullYear()+1;
  const cohort = {id:'early-year',title:'Early-year learning cohort',year,quarter:1,status:'planned',opensAt:null,closesAt:null,startsAt:null,format:'online',details:'An online programme with confirmed details published before applications open.',tuitionNote:'Fees have not yet been announced.',version:0};
  assert.equal((await h.fetch('/api/v2/staff/cohorts',post({...cohort,quarter:2},undefined,admin()))).status,400);
  assert.equal((await h.fetch('/api/v2/staff/cohorts',post(cohort,undefined,admin()))).status,200);
  const details = {track:'Web development',format:'online',experience:'Complete beginner',goals:'Build a useful website for a local business.',phone:''};
  const path = `/api/v2/training/cohorts/${cohort.id}/application`;
  const save = data => h.fetch(path,{...post(data,undefined,ada),method:'PUT'});
  assert.equal((await save({data:details,version:0,submit:true,consent:true})).status,409);
  const draft = await save({data:details,version:0,submit:false,consent:false}); assert.equal(draft.status,200,await draft.clone().text());
  const saved = (await draft.json()).application;
  assert.equal((await save({data:details,version:0,submit:false})).status,409);
  assert.equal((await (await h.fetch('/api/v2/training/applications',{headers:ben})).json()).applications.length,0);
  assert.equal((await h.fetch(`/api/v2/training/applications/${saved.id}/withdraw`,post({version:1},undefined,ben))).status,409);
  const opened = {...cohort,status:'open',version:1,opensAt:new Date(Date.now()-3600000).toISOString(),closesAt:new Date(Date.now()+3600000).toISOString(),startsAt:`${year}-01-10T10:00:00.000Z`};
  assert.equal((await h.fetch('/api/v2/staff/cohorts',post(opened,undefined,admin()))).status,200);
  const submitted = await save({data:details,version:1,submit:true,consent:true}); assert.equal(submitted.status,200,await submitted.clone().text());
  assert.equal((await save({data:details,version:2,submit:true,consent:true})).status,409);
  const review = await h.fetch(`/api/v2/staff/applications/${saved.id}`,{...post({status:'offered',version:2},undefined,admin()),method:'PATCH'});
  assert.equal(review.status,200); assert.equal((await review.json()).application.status,'offered');
  assert.equal((await h.db.prepare('SELECT count(*) AS count FROM learning_enrolments').first()).count,0);
});
