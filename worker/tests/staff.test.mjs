import test from 'node:test';
import assert from 'node:assert/strict';
import { post, admin, application, createHarness } from './harness.mjs';
import { setup } from './platform-harness.mjs';

const json = (data, headers, method = 'POST') => ({ ...post(data, undefined, headers), method });
const course = { id:'staff-course', title:'Staff course draft', summary:'A practical course created by an editor account.', level:'Beginner', priceMinor:0 };
async function staffHeader(h, uid, extra = {}) { return { Authorization:`Bearer ${await h.token(uid, { email:`${uid}@example.com`, ...extra })}` }; }
async function grant(h, email, role, headers = admin()) {
  const response = await h.fetch('/api/v1/admin/staff', json({ email, role, name:'Team Member' }, headers));
  assert.equal(response.status, 200, await response.clone().text());
  return (await response.json()).member;
}

test('owner token bootstraps grants; roles gate API areas; no self-registration to staff', async t => {
  const h = await setup(t);
  const learner = await h.register();
  assert.equal((await h.fetch('/api/v1/admin/me', { headers:learner })).status, 403);
  assert.equal((await h.fetch('/api/v1/admin/staff', json({ email:'ada@example.com', role:'owner' }, learner))).status, 403);
  assert.equal((await h.fetch('/api/v1/admin/me')).status, 401);
  assert.equal((await h.fetch('/api/v1/admin/me', { headers:{ Authorization:'Bearer wrong-token-wrong-token-wrong-token-123' } })).status, 401);

  const me = await (await h.fetch('/api/v1/admin/me', { headers:admin() })).json();
  assert.deepEqual(me.staff, { method:'token', role:'owner', email:null, name:'Owner access token', permissions:{ inbox:true, studio:true, training:true, team:true } });
  for (const bad of [{ email:'ed@example.com', role:'admin' }, { email:'not-an-email', role:'editor' }, { email:'ed@example.com', role:'editor', uid:'ed' }])
    assert.equal((await h.fetch('/api/v1/admin/staff', json(bad, admin()))).status, 400);
  const editor = await grant(h, 'Ed@Example.com', 'editor');
  assert.equal(editor.email, 'ed@example.com'); assert.equal(editor.linked, false); assert.equal(editor.grantedBy, 'admin');
  assert.equal((await h.fetch('/api/v1/admin/staff', json({ email:'ed@example.com', role:'owner' }, admin()))).status, 409);
  await grant(h, 'rev@example.com', 'reviewer');

  const ed = await staffHeader(h, 'ed');
  const edMe = (await (await h.fetch('/api/v1/admin/me', { headers:ed })).json()).staff;
  assert.deepEqual([edMe.method, edMe.role, edMe.email, edMe.permissions], ['account', 'editor', 'ed@example.com', { inbox:false, studio:true, training:false, team:false }]);
  assert.equal((await h.db.prepare('SELECT uid FROM staff_members WHERE email=?').bind('ed@example.com').first()).uid, 'ed');
  assert.equal((await h.fetch('/api/v2/staff/courses', json(course, ed))).status, 200);
  assert.equal((await h.fetch('/api/v2/staff/courses', { headers:ed })).status, 200);
  for (const path of ['/api/v1/admin/submissions', '/api/v2/staff/applications', '/api/v2/staff/cohorts', '/api/v1/admin/staff'])
    assert.equal((await h.fetch(path, { headers:ed })).status, 403, path);
  assert.equal((await h.fetch('/api/v1/admin/staff', json({ email:'ed@example.com', role:'owner' }, ed))).status, 403);

  // Reviewers see enquiries and training, never the studio; status changes are attributed.
  const submitted = await createHarnessSubmission(h);
  const rev = await staffHeader(h, 'rev');
  assert.equal((await h.fetch('/api/v2/staff/courses', { headers:rev })).status, 403);
  assert.equal((await h.fetch('/api/v2/staff/applications', { headers:rev })).status, 200);
  const list = await (await h.fetch('/api/v1/admin/submissions', { headers:rev })).json();
  assert.equal(list.items.length, 1);
  assert.equal((await h.fetch(`/api/v1/admin/submissions/${submitted}`, json({ status:'contacted', version:1 }, rev, 'PATCH'))).status, 200);
  const trail = await (await h.fetch(`/api/v1/admin/submissions/${submitted}/audit`, { headers:rev })).json();
  assert.equal(trail.items[0].actor, 'staff:rev@example.com');

  // Signed-in strangers, unverified addresses and look-alike addresses never gain staff access.
  assert.equal((await h.fetch('/api/v1/admin/me', { headers:await staffHeader(h, 'mallory') })).status, 403);
  assert.equal((await h.fetch('/api/v1/admin/me', { headers:await staffHeader(h, 'ed', { email_verified:false }) })).status, 401);
  assert.equal((await h.fetch('/api/v1/admin/me', { headers:await staffHeader(h, 'ed', { email:'ed@example.com.evil.test' }) })).status, 403);
  assert.equal((await h.db.prepare('SELECT count(*) AS count FROM staff_members').first()).count, 2);
});

async function createHarnessSubmission(h) {
  // Enquiries are public; applications need an account once the platform is on.
  const response = await h.fetch('/api/v1/project-requests', post({ name:'Sam Example', email:'sam@example.com', category:'business-software', summary:'A stock tracking website', details:'We need a small inventory tool for our shop, with a stock list and low-stock reminders.', consent:true }));
  assert.equal(response.status, 201);
  return (await response.json()).id;
}

test('revocation is immediate, grants bind to one Firebase account, owners cannot lock themselves out', async t => {
  const h = await setup(t);
  const editor = await grant(h, 'ed@example.com', 'editor');
  const ed = await staffHeader(h, 'ed');
  assert.equal((await h.fetch('/api/v2/staff/courses', { headers:ed })).status, 200);
  // A different Firebase account that later claims the same verified email cannot reuse the grant.
  assert.equal((await h.fetch('/api/v2/staff/courses', { headers:await staffHeader(h, 'ed-new-account', { email:'ed@example.com' }) })).status, 403);

  // A Firebase-level disabled account fails even with an active staff grant.
  h.state.disabled = true;
  assert.equal((await h.fetch('/api/v1/admin/me', { headers:ed })).status, 401);
  h.state.disabled = false;

  const owner = await grant(h, 'own@example.com', 'owner');
  const own = await staffHeader(h, 'own');
  const ownMe = (await (await h.fetch('/api/v1/admin/me', { headers:own })).json()).staff;
  assert.deepEqual([ownMe.role, ownMe.permissions.team], ['owner', true]);
  assert.equal((await h.fetch(`/api/v1/admin/staff/${owner.id}/revoke`, json({ version:owner.version }, own))).status, 409);
  assert.equal((await h.fetch(`/api/v1/admin/staff/${owner.id}`, json({ role:'editor', version:owner.version }, own, 'PATCH'))).status, 409);
  assert.equal((await h.fetch('/api/v1/admin/staff', json({ email:'own@example.com', role:'editor' }, own))).status, 409);

  const promoted = await h.fetch(`/api/v1/admin/staff/${editor.id}`, json({ role:'reviewer', version:editor.version }, own, 'PATCH'));
  assert.equal(promoted.status, 200);
  const reviewer = (await promoted.json()).member;
  assert.equal(reviewer.role, 'reviewer'); assert.equal(reviewer.linked, true);
  assert.equal((await h.fetch('/api/v2/staff/courses', { headers:ed })).status, 403);
  assert.equal((await h.fetch(`/api/v1/admin/staff/${editor.id}/revoke`, json({ version:editor.version }, own))).status, 409, 'stale version');
  assert.equal((await h.fetch(`/api/v1/admin/staff/${editor.id}/revoke`, json({ version:reviewer.version }, own))).status, 200);
  assert.equal((await h.fetch('/api/v1/admin/me', { headers:ed })).status, 403);
  assert.equal((await h.fetch(`/api/v1/admin/staff/${editor.id}/revoke`, json({ version:reviewer.version + 1 }, own))).status, 409);

  // Granting again restores access and clears the old account link for the next verified sign-in.
  const restored = await grant(h, 'ed@example.com', 'editor', own);
  assert.equal(restored.id, editor.id); assert.equal(restored.linked, false);
  const newEd = await staffHeader(h, 'ed-new-account', { email:'ed@example.com' });
  assert.equal((await h.fetch('/api/v2/staff/courses', { headers:newEd })).status, 200);
  assert.equal((await h.fetch('/api/v2/staff/courses', { headers:ed })).status, 403);

  const { members, audit } = await (await h.fetch('/api/v1/admin/staff', { headers:admin() })).json();
  assert.deepEqual(members.map(item => [item.email, item.role, item.status]).sort(), [['ed@example.com', 'editor', 'active'], ['own@example.com', 'owner', 'active']]);
  assert.deepEqual(audit.map(item => [item.action, item.email, item.actor]), [
    ['grant', 'ed@example.com', 'staff:own@example.com'], ['revoke', 'ed@example.com', 'staff:own@example.com'], ['role', 'ed@example.com', 'staff:own@example.com'],
    ['grant', 'own@example.com', 'admin'], ['grant', 'ed@example.com', 'admin']]);
  assert.equal((await h.fetch('/api/v1/admin/staff/not-a-staff-id/revoke', json({ version:1 }, admin()))).status, 404);
  assert.equal((await h.fetch('/api/health')).status, 200);
});

test('shared owner token still works when account sign-in is not configured', async t => {
  const h = await createHarness();
  t.after(() => h.close());
  assert.equal((await h.fetch('/api/v1/admin/me', { headers:admin() })).status, 200);
  assert.equal((await h.fetch('/api/v1/admin/submissions', { headers:admin() })).status, 200);
  assert.equal((await h.fetch('/api/v1/admin/me', { headers:{ Authorization:`Bearer ${'a'.repeat(30)}.${'b'.repeat(60)}.${'c'.repeat(40)}` } })).status, 503);
  assert.equal((await h.fetch('/api/v1/applications', post(application()))).status, 201);
});

test('configured owner can bootstrap with a verified account without the old admin token', async t => {
  const h = await setup(t, { ACADEMY_OWNER_EMAIL:'owner@example.com' });
  await h.db.batch([h.db.prepare('DROP TABLE staff_audit'), h.db.prepare('DROP TABLE staff_members')]);
  assert.equal((await h.fetch('/api/health')).status, 200, 'Git-connected deployment prepares additive staff tables without interactive Wrangler access');
  const stranger = await staffHeader(h, 'stranger');
  assert.equal((await h.fetch('/api/v1/admin/me', { headers:stranger })).status, 403);
  const owner = await staffHeader(h, 'owner');
  const response = await h.fetch('/api/v1/admin/me', { headers:owner });
  assert.equal(response.status, 200, await response.clone().text());
  assert.deepEqual([(await response.json()).staff.role, (await h.db.prepare('SELECT count(*) AS count FROM staff_members').first()).count], ['owner', 1]);
  assert.equal((await h.fetch('/api/v1/admin/me', { headers:owner })).status, 200);
  const record = await h.db.prepare("SELECT id,version FROM staff_members WHERE email='owner@example.com'").first();
  assert.equal((await h.fetch(`/api/v1/admin/staff/${record.id}/revoke`, json({ version:record.version }, admin()))).status, 200);
  assert.equal((await h.fetch('/api/v1/admin/me', { headers:owner })).status, 403, 'revoked owner must not be restored automatically');
  assert.equal((await h.db.prepare('SELECT count(*) AS count FROM staff_audit').first()).count, 2);
});
