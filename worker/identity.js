import { createRemoteJWKSet, jwtVerify } from 'jose';
import { HttpError, readJSON } from './validation.js';
import { checkOrigin, hmacHex, configuredSecret } from './security.js';
import { database } from './storage.js';

const keys = createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'), { timeoutDuration:5000, cooldownDuration:30000 });
export const ACCOUNT_CONSENT = 'learner-account-v1-2026-09-11';
export const platformEnabled = env => env.LEARNING_PLATFORM === 'enabled';
export function firebaseConfig(env) {
  if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(env.FIREBASE_PROJECT_ID || '') || !/^[A-Za-z0-9_-]{30,100}$/.test(env.FIREBASE_API_KEY || '') || !env.FIREBASE_APP_ID) return null;
  return { projectId:env.FIREBASE_PROJECT_ID, apiKey:env.FIREBASE_API_KEY, authDomain:`${env.FIREBASE_PROJECT_ID}.firebaseapp.com`, appId:env.FIREBASE_APP_ID };
}
export const identityReady = env => platformEnabled(env) && !!firebaseConfig(env) && configuredSecret(env.SECURITY_SALT);
export function exactFields(input, allowed) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !allowed.includes(key))) throw new HttpError(400, 'Unexpected field. Please refresh and try again.');
}
export function textValue(value, min, max, label) {
  if (typeof value !== 'string' || [...value.trim()].length < min || [...value.trim()].length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\ud800-\udfff]/u.test(value)) throw new HttpError(400, `${label} must contain ${min}-${max} valid characters.`);
  return value.trim();
}
export async function quota(db, key, limit, seconds) {
  const now = Math.floor(Date.now()/1000), window = Math.floor(now/seconds), expiry = (window+1)*seconds;
  const row = await db.prepare(`INSERT INTO rate_buckets(bucket_key,count,expires_at) VALUES (?,1,?)
    ON CONFLICT(bucket_key) DO UPDATE SET count=count+1 WHERE count < ? RETURNING count`)
    .bind(`learning:${key}:${window}`,expiry+3600,limit).first();
  if (!row) throw new HttpError(429,'Too many requests. Please wait before trying again.',undefined,{'Retry-After':String(expiry-now)});
}
async function verifiedIdentity(request, env) {
  if (!identityReady(env)) throw new HttpError(503,'Account sign-in is not available yet.');
  const authorization = request.headers.get('authorization');
  if (!authorization) return null;
  const match = /^Bearer ([A-Za-z0-9._-]{100,8000})$/.exec(authorization);
  if (!match) throw new HttpError(401,'Please sign in again.');
  const db = database(env);
  await quota(db,'identity-global',10000,86400);
  await db.prepare('DELETE FROM rate_buckets WHERE bucket_key IN (SELECT bucket_key FROM rate_buckets WHERE expires_at < ? LIMIT 100)').bind(Math.floor(Date.now()/1000)).run();
  const ip = await hmacHex(env.SECURITY_SALT,`firebase:${Math.floor(Date.now()/86400000)}:${request.headers.get('cf-connecting-ip') || 'local'}`);
  await quota(db,`identity:${ip}`,180,600);
  let payload;
  try {
    ({payload} = await jwtVerify(match[1],keys,{ algorithms:['RS256'], audience:env.FIREBASE_PROJECT_ID,
      issuer:`https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}`, requiredClaims:['exp','iat','auth_time','sub','email'] }));
  } catch { throw new HttpError(401,'Your sign-in could not be verified. Please sign in again.'); }
  const now = Math.floor(Date.now()/1000);
  if (!payload.sub || payload.sub.length > 128 || !Number.isInteger(payload.auth_time) || payload.auth_time > now || payload.auth_time < 0 || payload.iat > now || payload.email_verified !== true || payload.firebase?.sign_in_provider !== 'google.com') throw new HttpError(401,'Use a verified Google account to continue.');
  // Check current account state, not just JWT expiry: deleted/disabled users and
  // revoked sessions must not retain access with an unexpired ID token.
  let response;
  try {
    response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${env.FIREBASE_API_KEY}`,{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idToken:match[1]}),signal:AbortSignal.timeout(6000),redirect:'manual'
    });
  } catch { throw new HttpError(503,'Account verification is temporarily unavailable.'); }
  if (!response.ok) throw new HttpError(response.status >= 500 || response.status === 429 ? 503 : 401,'Please try signing in again.');
  let value;
  try { value = (await response.json()).users?.[0]; } catch { throw new HttpError(503,'Account verification is temporarily unavailable.'); }
  if (!value || value.localId !== payload.sub || value.disabled || value.emailVerified !== true || value.email !== payload.email || Number(value.validSince || 0) > payload.auth_time) throw new HttpError(401,'This sign-in is no longer valid. Please sign in again.');
  return { id:payload.sub, email:textValue(value.email,3,254,'Email'), name:typeof value.displayName === 'string' ? value.displayName.slice(0,100) : '' };
}
export async function identitySession(request, env) {
  const identity = await verifiedIdentity(request,env);
  if (!identity) return null;
  const user = await database(env).prepare('SELECT id,name,email,disabled FROM learner_users WHERE id=?').bind(identity.id).first();
  if (!user) return null;
  if (user.disabled) throw new HttpError(403,'This Academy account is disabled. Contact the team.');
  return {user};
}
export async function requireLearner(request, env) {
  const result = await identitySession(request,env);
  if (!result) throw new HttpError(401,'Create your Academy account before continuing.');
  return result.user;
}
export const publicUser = value => ({id:value.id,name:value.name,email:value.email});
export async function identityRoute(request, env, path) {
  if (!identityReady(env)) throw new HttpError(503,'Account sign-in is not available yet.');
  if (path !== '/api/auth/register') throw new HttpError(404,'Account endpoint not found.');
  if (request.method !== 'POST') throw new HttpError(405,'Use POST.',undefined,{Allow:'POST'});
  checkOrigin(request,env,true);
  if (new URL(request.url).search) throw new HttpError(400,'URL parameters are not accepted.');
  const input = await readJSON(request);
  exactFields(input,['name','consent']);
  if (input.consent !== true) throw new HttpError(400,'Accept the account privacy notice before continuing.');
  const name = textValue(input.name,2,100,'Full name'), identity = await verifiedIdentity(request,env);
  if (!identity) throw new HttpError(401,'Sign in with Google first.');
  const db = database(env), now = Date.now();
  const existing = await db.prepare('SELECT disabled FROM learner_users WHERE id=?').bind(identity.id).first();
  if (existing?.disabled) throw new HttpError(403,'This Academy account is disabled. Contact the team.');
  await db.batch([
    db.prepare('INSERT INTO learner_users(id,name,email,created_at,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(id) DO NOTHING').bind(identity.id,name,identity.email,now,now),
    db.prepare('INSERT INTO learner_profiles(user_id,consent_version,consent_at) VALUES (?,?,?) ON CONFLICT(user_id) DO NOTHING').bind(identity.id,ACCOUNT_CONSENT,new Date(now).toISOString())
  ]);
  const user = await db.prepare('SELECT id,name,email FROM learner_users WHERE id=?').bind(identity.id).first();
  return Response.json({user:publicUser(user)});
}
