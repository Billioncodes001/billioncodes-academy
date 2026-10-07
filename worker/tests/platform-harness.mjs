import assert from 'node:assert/strict';
import { generateKeyPair, exportJWK, SignJWT, decodeJwt } from 'jose';
import { createHarness, post } from './harness.mjs';

// Shared learning-platform harness: local Miniflare D1/R2 with mocked Google identity endpoints only.
const projectId = 'billion-codes-academy';
export async function setup(t) {
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
