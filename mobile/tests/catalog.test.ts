import { test } from 'node:test';
import assert from 'node:assert/strict';
import { challenges, emptyProgress, gradeChallenge, MAX_CODE_LENGTH, primer, recordAttempt, saveDraft } from '@billioncodes/learning';
import { CATALOG_URL, decodeDownload, decodeProgress, fetchCatalog, MAX_CATALOG_BYTES } from '../src/catalog';
import { checkAttempt } from '../src/practice';

const catalog = { courses: [primer], training: { status: 'applications-open' }, payments: { enabled: false } };
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
const mock = (response: Response): typeof fetch => async () => response;
const solutions = [
  '<main><h1>My introduction</h1><p>I build useful things.</p></main>',
  '<h1>Reading list</h1><ul><li><a href="https://example.com">Read the guide</a></li><li>HTML basics</li><li>Design notes</li></ul>',
  '<form><label for="email">Email address</label><input id="email" type="email" name="email" required><button type="submit">Send message</button></form>',
  '<main><h1>Campus club</h1><section><h2>This week</h2><p>A chapter to discuss.</p></section><a href="https://example.com/guide">Read the club guide</a></main>',
];

test('catalog uses the canonical public GET, omits credentials and never sets Origin', async () => {
  const result = await fetchCatalog(async (url, init) => {
    assert.equal(url, CATALOG_URL); assert.equal(init?.method, 'GET');
    assert.equal(init?.credentials, 'omit'); assert.equal(init?.body, undefined);
    assert.deepEqual(init?.headers, { Accept: 'application/json' });
    return json(catalog);
  });
  assert.equal(result.courses[0].id, primer.id);
});

test('catalog accepts an honest empty course list', async () => {
  const result = await fetchCatalog(mock(json({ ...catalog, courses: [] })));
  assert.equal(result.courses.length, 0);
});

test('catalog rejects failed, malformed, HTML and incompatible responses', async () => {
  await assert.rejects(fetchCatalog(mock(new Response('error', { status: 503 }))), /503/);
  await assert.rejects(fetchCatalog(mock(new Response('<html>SPA</html>'))), /not JSON/);
  await assert.rejects(fetchCatalog(mock(json({ courses: 'wrong' }))), /supported/);
  await assert.rejects(fetchCatalog(mock(new Response('{bad', { headers: { 'content-type': 'application/json' } }))), /could not be read/);
});

test('catalog enforces declared and streamed response size bounds', async () => {
  await assert.rejects(fetchCatalog(mock(new Response('{}', { headers: { 'content-type': 'application/json', 'content-length': String(MAX_CATALOG_BYTES + 1) } }))), /too large/);
  await assert.rejects(fetchCatalog(mock(new Response(' '.repeat(MAX_CATALOG_BYTES + 1), { headers: { 'content-type': 'application/json' } }))), /too large/);
});

test('catalog aborts stalled requests and gives a retryable timeout message', async () => {
  await assert.rejects(fetchCatalog(async (_url, init) => new Promise((_resolve, reject) => {
    init!.signal!.addEventListener('abort', () => reject(new Error('aborted')));
  }), 5), /timed out/);
});

test('downloads preserve an explicit save date and reject invalid/future versions', () => {
  const savedAt = '2026-01-01T10:00:00.000Z';
  assert.equal(decodeDownload(JSON.stringify({ version: 1, savedAt, catalog })).savedAt, savedAt);
  for (const value of [{ version: 2, savedAt, catalog }, { version: 1, savedAt: 'wrong', catalog }, { version: 1, savedAt: '2099-01-01', catalog }, { version: 1, savedAt, catalog: {} }]) assert.throws(() => decodeDownload(JSON.stringify(value)));
});

test('progress normalization never trusts forged completion booleans', () => {
  const value = decodeProgress(JSON.stringify({ ...emptyProgress(), solved: { 'profile-card': true, 'reading-list': '<p>not a solution</p>' } }));
  assert.deepEqual(value.solved, {});
  assert.throws(() => decodeProgress('{broken'));
  assert.throws(() => decodeProgress('{"version":2}'));
});

test('inherited course property names cannot reach object-keyed progress helpers', async () => {
  const unsafe = { ...catalog, courses: [{ ...primer, id: 'constructor' }] };
  await assert.rejects(fetchCatalog(mock(json(unsafe))), /supported/);
  assert.throws(() => decodeDownload(JSON.stringify({ version: 1, savedAt: '2026-01-01T00:00:00Z', catalog: unsafe })));
});

test('deep learner markup stays recoverable even if the shared grader throws', () => {
  const code = '<div>'.repeat(2000);
  const result = checkAttempt(emptyProgress(), 'profile-card', code);
  assert.equal(result.feedback.passed, false);
  assert.equal(result.progress.drafts['profile-card'], code);
  assert.deepEqual(result.progress.solved, {});
});

test('all four editors use shared goals and store only actual passing solutions', () => {
  let progress = emptyProgress();
  assert.equal(challenges.length, 4);
  challenges.forEach((challenge, index) => {
    assert.equal(gradeChallenge(challenge.id, challenge.starter).passed, false);
    const result = gradeChallenge(challenge.id, solutions[index]);
    assert.equal(result.passed, true);
    assert.deepEqual(result.checks.slice(0, challenge.goals.length).map(item => item.label), challenge.goals);
    progress = recordAttempt(progress, challenge.id, solutions[index]);
    assert.equal(gradeChallenge(challenge.id, solutions[index] + '<script>alert(1)</script>').passed, false);
  });
  assert.equal(Object.keys(decodeProgress(JSON.stringify(progress)).solved).length, 4);
});

test('four escaped-null drafts and solutions hydrate above 512 KiB, with a 1,000,000-character cap', () => {
  let progress = emptyProgress();
  challenges.forEach((challenge, index) => {
    const code = solutions[index].padEnd(MAX_CODE_LENGTH, String.fromCharCode(0));
    progress = recordAttempt(progress, challenge.id, code);
    progress = saveDraft(progress, challenge.id, String.fromCharCode(0).repeat(MAX_CODE_LENGTH));
  });
  const raw = JSON.stringify(progress);
  assert.ok(raw.length > 512 * 1024);
  const decoded = decodeProgress(raw);
  assert.equal(Object.keys(decoded.solved).length, 4);
  assert.deepEqual(decoded.drafts, progress.drafts);
  const atLimit = raw.padEnd(1_000_000);
  assert.doesNotThrow(() => decodeProgress(atLimit));
  assert.throws(() => decodeProgress(atLimit + ' '), /Oversized progress/);
});
