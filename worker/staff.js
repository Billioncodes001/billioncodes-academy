import { HttpError } from './validation.js';
import { adminTokenMatches, configuredSecret } from './security.js';
import { database } from './storage.js';
import { identityReady, verifiedIdentity, exactFields, textValue } from './identity.js';

// Individual staff access. Owners grant a role to a verified email address; there is no
// self-registration. The configured original owner's verified identity is a one-time
// bootstrap when no grant for that address exists; ADMIN_TOKEN remains break-glass only.
export const ROLES = ['owner','editor','reviewer'];
// Areas each non-owner role may use. Owners may use every area, including team management.
const AREAS = { inbox:['reviewer'], studio:['editor'], training:['reviewer'], team:[] };
const JWT = /^Bearer [A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}$/;
const EMAIL = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;
const STAFF_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SEEN_INTERVAL_MS = 5 * 60 * 1000;
const challenge = { 'WWW-Authenticate':'Bearer' };

// Git-connected Worker deployments cannot rely on an interactive Wrangler session to
// apply a new D1 migration. Keep this fixed additive schema in sync with 0004 so a
// deployed Worker can prepare itself before its first health or staff request.
export async function ensureStaffSchema(db) {
  const { results } = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('staff_members','staff_audit')").all();
  if (results.length === 2) return;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS staff_members (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE CHECK(email = lower(email) AND length(email) BETWEEN 3 AND 254),
      name TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL CHECK(role IN ('owner','editor','reviewer')),
      status TEXT NOT NULL CHECK(status IN ('active','revoked')),
      uid TEXT UNIQUE,
      granted_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_seen_at TEXT,
      version INTEGER NOT NULL DEFAULT 1
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS staff_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id TEXT NOT NULL,
      email TEXT NOT NULL,
      action TEXT NOT NULL CHECK(action IN ('grant','role','revoke')),
      role TEXT NOT NULL,
      actor TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`),
  ]);
}

export const can = (session, area) => session.role === 'owner' || AREAS[area].includes(session.role);
export const permissions = session => Object.fromEntries(Object.keys(AREAS).map(area => [area, can(session, area)]));

export async function staffSession(request, env) {
  if (await adminTokenMatches(request, env)) return { method:'token', role:'owner', actor:'admin', memberId:null, email:null, name:'Owner access token' };
  const authorization = request.headers.get('authorization') || '';
  if (!JWT.test(authorization)) {
    if (!configuredSecret(env.ADMIN_TOKEN) && !identityReady(env)) throw new HttpError(503, 'Private operations are not configured.');
    throw new HttpError(401, 'Staff sign-in required.', undefined, challenge);
  }
  if (!identityReady(env)) throw new HttpError(503, 'Staff sign-in is not available yet. Use the owner access token.');
  // Signature, expiry, verified email, provider, disabled and revoked Firebase accounts are all checked here.
  const identity = await verifiedIdentity(request, env, 'staff-identity', 900);
  const email = identity.email.toLowerCase();
  const db = database(env);
  await ensureStaffSchema(db);
  let member = await db.prepare('SELECT id,email,name,role,status,uid,last_seen_at FROM staff_members WHERE email=?').bind(email).first();
  if (!member && email === String(env.ACADEMY_OWNER_EMAIL || '').trim().toLowerCase()) {
    const id = crypto.randomUUID(), now = new Date().toISOString();
    // Only a signed, currently valid and email-verified Firebase account reaches this
    // point. A revoked owner row is never silently restored on a later sign-in.
    await db.batch([
      db.prepare("INSERT INTO staff_members(id,email,name,role,status,granted_by,created_at,updated_at) VALUES (?,?,?,'owner','active','verified-owner-bootstrap',?,?) ON CONFLICT(email) DO NOTHING")
        .bind(id, email, identity.name || 'Academy owner', now, now),
      db.prepare("INSERT INTO staff_audit(member_id,email,action,role,actor,created_at) SELECT id,email,'grant',role,'verified-owner-bootstrap',? FROM staff_members WHERE id=?")
        .bind(now, id),
    ]);
    member = await db.prepare('SELECT id,email,name,role,status,uid,last_seen_at FROM staff_members WHERE email=?').bind(email).first();
  }
  if (!member || member.status !== 'active') throw new HttpError(403, 'This account does not have staff access. Ask the Academy owner to grant it.');
  if (member.uid && member.uid !== identity.id) throw new HttpError(403, 'This staff access is linked to a different sign-in for the same email. Ask the owner to grant access again.');
  const now = new Date();
  if (!member.uid) {
    // First staff sign-in binds the grant to this Firebase account.
    if (await db.prepare('SELECT id FROM staff_members WHERE uid=? AND id<>?').bind(identity.id, member.id).first()) throw new HttpError(403, 'This sign-in is already linked to another staff record. Ask the owner to review team access.');
    const bound = await db.prepare("UPDATE staff_members SET uid=?, last_seen_at=? WHERE id=? AND uid IS NULL AND status='active' RETURNING id").bind(identity.id, now.toISOString(), member.id).first();
    if (!bound) throw new HttpError(403, 'Staff access changed. Sign in again.');
  } else if (!member.last_seen_at || now - new Date(member.last_seen_at) > SEEN_INTERVAL_MS) {
    await db.prepare('UPDATE staff_members SET last_seen_at=? WHERE id=?').bind(now.toISOString(), member.id).run();
  }
  return { method:'account', role:member.role, actor:`staff:${email}`, memberId:member.id, email, name:member.name || identity.name };
}

export async function requireStaff(request, env, area) {
  const session = await staffSession(request, env);
  if (!can(session, area)) throw new HttpError(403, 'Your staff role does not include this area.');
  return session;
}

export const staffProfile = session => ({ method:session.method, role:session.role, email:session.email, name:session.name, permissions:permissions(session) });

const view = row => ({ id:row.id, email:row.email, name:row.name, role:row.role, status:row.status, linked:!!row.uid, grantedBy:row.granted_by, createdAt:row.created_at, updatedAt:row.updated_at, lastSeenAt:row.last_seen_at, version:row.version });
const MEMBER = 'SELECT id,email,name,role,status,uid,granted_by,created_at,updated_at,last_seen_at,version FROM staff_members';

function staffEmail(value) {
  if (typeof value !== 'string' || value.trim().length > 254 || !EMAIL.test(value.trim())) throw new HttpError(400, 'Enter a valid email address.');
  return value.trim().toLowerCase();
}
function role(value) {
  if (!ROLES.includes(value)) throw new HttpError(400, 'Choose owner, editor or reviewer.');
  return value;
}
function memberId(value) {
  if (!STAFF_ID.test(value)) throw new HttpError(404, 'Staff member not found.');
  return value;
}
function version(value) {
  if (!Number.isInteger(value) || value < 1) throw new HttpError(400, 'A valid version is required. Refresh and try again.');
  return value;
}
// The audit row is written in the same transaction, and only if the change actually applied.
const auditAfter = (db, action, actor, id, expectedVersion, now) =>
  db.prepare('INSERT INTO staff_audit(member_id,email,action,role,actor,created_at) SELECT id,email,?,role,?,? FROM staff_members WHERE id=? AND version=?')
    .bind(action, actor, now, id, expectedVersion);

export async function listStaff(db) {
  const { results:members } = await db.prepare(`${MEMBER} ORDER BY status, email LIMIT 200`).all();
  const { results:audit } = await db.prepare('SELECT email,action,role,actor,created_at AS createdAt FROM staff_audit ORDER BY id DESC LIMIT 50').all();
  return { members:members.map(view), audit, roles:ROLES };
}

export async function grantStaff(db, session, input) {
  exactFields(input, ['email','name','role']);
  const email = staffEmail(input.email), granted = role(input.role);
  const name = input.name === undefined || input.name === '' ? '' : textValue(input.name, 2, 100, 'Name');
  if (session.email === email) throw new HttpError(409, 'You cannot change your own staff access.');
  const now = new Date().toISOString();
  const existing = await db.prepare(`${MEMBER} WHERE email=?`).bind(email).first();
  if (existing?.status === 'active') throw new HttpError(409, 'This email already has staff access. Change the role instead.');
  let id, next;
  if (existing) {
    // A fresh grant clears the old Firebase link, so the next verified sign-in for this email is bound.
    id = existing.id; next = existing.version + 1;
    const [result] = await db.batch([
      db.prepare("UPDATE staff_members SET status='active', role=?, name=?, uid=NULL, granted_by=?, updated_at=?, version=version+1 WHERE id=? AND version=? AND status='revoked'").bind(granted, name, session.actor, now, id, existing.version),
      auditAfter(db, 'grant', session.actor, id, next, now)
    ]);
    if (!result.meta.changes) throw new HttpError(409, 'Staff access changed. Refresh and try again.');
  } else {
    id = crypto.randomUUID(); next = 1;
    try {
      await db.batch([
        db.prepare("INSERT INTO staff_members(id,email,name,role,status,granted_by,created_at,updated_at) VALUES (?,?,?,?,'active',?,?,?)").bind(id, email, name, granted, session.actor, now, now),
        auditAfter(db, 'grant', session.actor, id, next, now)
      ]);
    } catch { throw new HttpError(409, 'Staff access changed. Refresh and try again.'); }
  }
  return { member:view(await db.prepare(`${MEMBER} WHERE id=?`).bind(id).first()) };
}

async function change(db, session, rawId, input, fields, action, update) {
  exactFields(input, fields);
  const id = memberId(rawId), expected = version(input.version);
  const existing = await db.prepare(`${MEMBER} WHERE id=?`).bind(id).first();
  if (!existing) throw new HttpError(404, 'Staff member not found.');
  if (existing.id === session.memberId) throw new HttpError(409, 'You cannot change your own staff access.');
  if (existing.status !== 'active') throw new HttpError(409, 'This access is already revoked. Grant it again to restore it.');
  if (existing.version !== expected) throw new HttpError(409, 'Staff access changed. Refresh and try again.');
  const now = new Date().toISOString();
  const [result] = await db.batch([
    db.prepare(`UPDATE staff_members SET ${update.sql}, updated_at=?, version=version+1 WHERE id=? AND version=? AND status='active'`).bind(...update.values, now, id, expected),
    auditAfter(db, action, session.actor, id, expected + 1, now)
  ]);
  if (!result.meta.changes) throw new HttpError(409, 'Staff access changed. Refresh and try again.');
  return { member:view(await db.prepare(`${MEMBER} WHERE id=?`).bind(id).first()) };
}
export const updateStaffRole = (db, session, id, input) => change(db, session, id, input, ['role','version'], 'role', { sql:'role=?', values:[role(input?.role)] });
export const revokeStaff = (db, session, id, input) => change(db, session, id, input, ['version'], 'revoke', { sql:"status='revoked'", values:[] });
