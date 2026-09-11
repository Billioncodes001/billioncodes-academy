import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFragment } from 'parse5';
import { challenges, gradeChallenge, previewHTML, normalizeProgress, emptyProgress, recordAttempt, recordRead, saveDraft, parseCatalog, primer, MAX_CODE_LENGTH } from '../index.js';

const solutions = {
  'profile-card': '<main><h1>Hello, world</h1><p>I want to build a reading club.</p></main>',
  'reading-list': '<h1>Useful reading</h1><ul><li><a href="https://example.com/guide">Read the guide</a></li><li>HTML foundations</li><li>Accessible forms</li></ul>',
  'contact-form': '<form><label for="email">Your email address</label><input id="email" name="email" type="email" required><button type="submit">Send message</button></form>',
  'semantic-repair': '<main><h1>Reading club</h1><section><h2>This week</h2><p>One chapter at a time.</p></section><a href="https://example.com/guide">Read the club guide</a></main>',
};
for (const challenge of challenges) test(`${challenge.id}: starter fails, authored solution passes, script is rejected`, () => {
  assert.equal(gradeChallenge(challenge.id, challenge.starter).passed, false);
  assert.equal(gradeChallenge(challenge.id, solutions[challenge.id]).passed, true);
  assert.equal(gradeChallenge(challenge.id, solutions[challenge.id] + '<script>alert(1)</script>').passed, false);
});
test('form requires the same field to be labelled, named and required', () => {
  const split = '<form><label for="a">Email address</label><input id="a" type="email"><input type="email" name="other" required><button type="submit">Send email</button></form>';
  assert.equal(gradeChallenge('contact-form', split).passed, false);
  assert.equal(gradeChallenge('contact-form', solutions['contact-form'].replace('name="email"', 'id="another" name="email"') + '<p id="email">duplicate</p>').passed, false);
});
test('comments and escaped markup cannot satisfy exercise goals', () => {
  for (const code of ['<!-- ' + solutions['profile-card'] + ' -->', '&lt;main&gt;&lt;h1&gt;Hello&lt;/h1&gt;&lt;p&gt;Useful text&lt;/p&gt;&lt;/main&gt;']) assert.equal(gradeChallenge('profile-card', code).passed, false);
});
test('code is bounded and unknown exercises fail safely', () => {
  assert.ok(gradeChallenge('profile-card', 'x'.repeat(MAX_CODE_LENGTH + 1)).error);
  assert.ok(gradeChallenge('profile-card', null).error);
  assert.ok(gradeChallenge('unknown', '').error);
});
test('deeply nested but length-valid HTML cannot crash grading, preview or saved progress', () => {
  const nested = '<div>'.repeat(2390);
  assert.ok(nested.length < MAX_CODE_LENGTH);
  assert.ok(gradeChallenge('profile-card', nested).error);
  assert.match(previewHTML(nested), /Preview is unavailable/);
  assert.deepEqual(normalizeProgress({ version: 1, solved: { 'profile-card': nested } }).solved, {});
});
test('preview reconstructs inert elements and never preserves executable attributes or navigation', () => {
  const html = previewHTML('<main onclick="evil()"><h1>Good &amp; safe</h1><script>evil()</script><svg onload="evil()"></svg><iframe src="https://example.com"></iframe><a href="javascript:evil()">Read more</a><img src="https://example.com/pixel"><form action="https://example.com"><input name="secret"><button>Send</button></form><p style="background:url(https://example.com)">Text</p></main>');
  assert.ok(html.includes('Good &amp; safe'));
  assert.ok(html.includes('default-src'));
  assert.doesNotMatch(html, /evil|<script|<svg|<iframe|<img|href=|onclick=|style=|<form|action=/);
  assert.ok(html.includes('<button disabled>'));
  assert.doesNotThrow(() => parseFragment(html));
});
test('progress updates do not mutate previous state and failed edits preserve earlier completion', () => {
  const base = emptyProgress();
  const solved = recordAttempt(base, 'profile-card', solutions['profile-card']);
  assert.deepEqual(base, emptyProgress());
  const retry = recordAttempt(solved, 'profile-card', '<p>Try again</p>');
  assert.equal(retry.solved['profile-card'], solutions['profile-card']);
  assert.equal(retry.drafts['profile-card'], '<p>Try again</p>');
  assert.equal(saveDraft(base, 'missing', 'x'), base);
  assert.equal(saveDraft(base, 'profile-card', 'x'.repeat(MAX_CODE_LENGTH + 1)), base);
});
test('reading records deduplicate, undo and resume correctly', () => {
  let state = recordRead(emptyProgress(), primer.id, primer.lessons[0].id, true);
  state = recordRead(state, primer.id, primer.lessons[0].id, true);
  assert.equal(state.read[primer.id].length, 1);
  assert.equal(state.lastLesson.lessonId, primer.lessons[0].id);
  assert.deepEqual(recordRead(state, primer.id, primer.lessons[0].id, false).read[primer.id], []);
});
test('import distrusts completion flags, prototype names, oversized drafts and unknown versions', () => {
  const state = normalizeProgress(JSON.parse('{"version":1,"read":{"__proto__":["polluted"],"valid":["one","one",null]},"drafts":{"profile-card":"draft"},"solved":{"profile-card":true}}'));
  assert.deepEqual(state.read, { valid: ['one'] });
  assert.deepEqual(state.solved, {});
  assert.equal({}.polluted, undefined);
  assert.deepEqual(normalizeProgress({ version: 2 }), emptyProgress());
  assert.deepEqual(normalizeProgress({ version: 1, drafts: { 'profile-card': 'x'.repeat(MAX_CODE_LENGTH + 1) } }).drafts, {});
  assert.equal(normalizeProgress({ version: 1, solved: solutions }).solved['profile-card'], solutions['profile-card']);
});
test('catalogue parser accepts authored lessons and strips unexpected fields', () => {
  const value = { courses: [primer], training: { status: 'applications-open' }, payments: { enabled: false }, secret: 'not shared' };
  assert.equal(parseCatalog(value).courses[0].id, primer.id);
  assert.equal(parseCatalog(value).secret, undefined);
  assert.equal(parseCatalog({ ...value, courses: [primer, primer] }), null);
  assert.equal(parseCatalog({ ...value, courses: [{ ...primer, lessons: [primer.lessons[0], primer.lessons[0]] }] }), null);
  assert.equal(parseCatalog({ ...value, courses: [{ ...primer, id: '__proto__' }] }), null);
  assert.equal(parseCatalog({ ...value, courses: [{ ...primer, lessons: [{ id: 'one', title: 'One', body: ['x'.repeat(10001)] }] }] }), null);
});
