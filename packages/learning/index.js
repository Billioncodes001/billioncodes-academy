import { parseFragment } from 'parse5';

export const MAX_CODE_LENGTH = 12000;
export const WORKSPACE_KEY = 'billioncodes:workspace:v1';
export const CATALOG_KEY = 'billioncodes:download:v1';
const validId = value => typeof value === 'string' && !['constructor', 'prototype'].includes(value) && /^[a-z0-9][a-z0-9-]{0,79}$/.test(value);
const text = node => node.nodeName === '#text' ? node.value : (node.childNodes || []).map(text).join('');
const elements = node => (node.childNodes || []).flatMap(child => child.tagName ? [child, ...elements(child)] : elements(child));
const attribute = (node, name) => node.attrs?.find(item => item.name === name)?.value || '';
const meaningful = node => text(node).trim().length > 2;
function parseExercise(code) {
  const tree = parseFragment(code);
  const stack = [{ node: tree, depth: 0 }];
  let count = 0;
  while (stack.length) {
    const { node, depth } = stack.pop();
    if (++count > 2000 || depth > 80) throw new Error('This example is too deeply nested or complex. Simplify the HTML and try again.');
    for (const child of node.childNodes || []) stack.push({ node: child, depth: depth + 1 });
  }
  return tree;
}

export const challenges = Object.freeze([
  { id: 'profile-card', title: 'Make your introduction', minutes: 8,
    brief: 'Create a small personal introduction with meaningful HTML. Use a main element, one heading and a paragraph about something you want to build.',
    starter: '<main>\n  <!-- Add a heading and a paragraph. -->\n</main>',
    hint: 'Put one <h1> and one <p> inside <main>. Give each some meaningful text.',
    goals: ['Use one main landmark', 'Give the page one clear h1 heading', 'Add a descriptive paragraph inside main'] },
  { id: 'reading-list', title: 'Build a reading list', minutes: 10,
    brief: 'Make a reading list with a heading and three items. Add a descriptive HTTPS link to an item. You choose the subjects.',
    starter: '<main>\n  <h1>My reading list</h1>\n  <ul>\n    <!-- Add three useful items. -->\n  </ul>\n</main>',
    hint: 'Use <li> for each list item. A link looks like <a href="https://example.com">Read the guide</a>.',
    goals: ['Add a clear h1 heading', 'Use a list with at least three meaningful items', 'Include a descriptive HTTPS link inside a list item'] },
  { id: 'contact-form', title: 'Make a form understandable', minutes: 12,
    brief: 'Practice an accessible email form. This is a non-submitting exercise, not a real contact form. Associate a visible label with an email input and add a submit button.',
    starter: '<form>\n  <label>Email address</label>\n  <input type="email">\n  <button>Send message</button>\n</form>',
    hint: 'Use matching for and id values on the label/input. Give the input a name and required attribute. Write type="submit" on the button.',
    goals: ['Use one form', 'Associate a visible label with a unique email input ID', 'Give the email field a name and make it required', 'Add a descriptive submit button'] },
  { id: 'semantic-repair', title: 'Repair a page structure', minutes: 10,
    brief: 'Replace the generic elements with meaningful HTML: main content, a top-level heading, a section with its own heading, and a real navigation link.',
    starter: '<div>\n  <div>Campus reading club</div>\n  <div>\n    <div>This week</div>\n    <p>One chapter. One conversation.</p>\n  </div>\n  <div>Read the club guide</div>\n</div>',
    hint: 'Use <main>, <h1>, <section>, <h2> and <a href="https://example.com/guide">. Do not make a div act like a link.',
    goals: ['Use one main containing an h1', 'Give a section an h2 and a paragraph', 'Use a descriptive HTTPS anchor instead of a fake clickable element'] },
]);

export function gradeChallenge(id, code) {
  const challenge = challenges.find(item => item.id === id);
  if (!challenge) return { passed: false, checks: [], error: 'This exercise does not exist.' };
  if (typeof code !== 'string' || code.length > MAX_CODE_LENGTH) return { passed: false, checks: [], error: `Keep the exercise under ${MAX_CODE_LENGTH} characters.` };
  let tree;
  try { tree = parseExercise(code); }
  catch { return { passed: false, checks: [], error: 'This example is too deeply nested or complex. Simplify the HTML and try again.' }; }
  const nodes = elements(tree);
  const all = tag => nodes.filter(node => node.tagName === tag);
  const inside = (node, tag) => elements(node).filter(child => child.tagName === tag);
  const safeLink = node => /^https:\/\/[^\s/]+(?:\/|$)/i.test(attribute(node, 'href')) && meaningful(node) && !/^(click here|here|link)$/i.test(text(node).trim());
  let results;
  if (id === 'profile-card') {
    const mains = all('main');
    results = [mains.length === 1, all('h1').length === 1 && mains.some(node => inside(node, 'h1').some(meaningful)), mains.some(node => inside(node, 'p').some(meaningful))];
  } else if (id === 'reading-list') {
    const lists = [...all('ul'), ...all('ol')];
    results = [all('h1').length === 1 && all('h1').some(meaningful), lists.some(node => (node.childNodes || []).filter(child => child.tagName === 'li' && meaningful(child)).length >= 3), lists.some(node => inside(node, 'li').some(item => inside(item, 'a').some(safeLink)))];
  } else if (id === 'contact-form') {
    const forms = all('form');
    const emails = forms.flatMap(node => inside(node, 'input')).filter(node => attribute(node, 'type').toLowerCase() === 'email');
    const labelled = emails.filter(node => {
      const id = attribute(node, 'id');
      return !!id && nodes.filter(item => attribute(item, 'id') === id).length === 1 && forms.some(form => inside(form, 'input').includes(node) && inside(form, 'label').some(label => attribute(label, 'for') === id && meaningful(label)));
    });
    results = [forms.length === 1, labelled.length > 0, labelled.some(node => !!attribute(node, 'name').trim() && node.attrs.some(attr => attr.name === 'required')), forms.some(node => inside(node, 'button').some(button => attribute(button, 'type').toLowerCase() === 'submit' && meaningful(button)))];
  } else {
    const mains = all('main');
    results = [mains.length === 1 && inside(mains[0], 'h1').some(meaningful), mains.some(node => inside(node, 'section').some(section => inside(section, 'h2').some(meaningful) && inside(section, 'p').some(meaningful))), mains.some(node => inside(node, 'a').some(safeLink))];
  }
  const forbidden = nodes.some(node => ['script', 'iframe', 'object', 'embed', 'style', 'link', 'svg', 'math'].includes(node.tagName) || node.attrs.some(attr => /^on/i.test(attr.name) || ['src', 'srcdoc'].includes(attr.name) || (attr.name === 'href' && !/^https:\/\//i.test(attr.value))));
  const checks = challenge.goals.map((label, index) => ({ label, passed: !!results[index] }));
  checks.push({ label: 'Keep this HTML exercise free of scripts, embeds and unsafe URLs', passed: !forbidden });
  return { passed: checks.every(check => check.passed), checks };
}

const escape = value => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const displayTags = new Set(['main', 'section', 'article', 'header', 'footer', 'h1', 'h2', 'h3', 'p', 'ul', 'ol', 'li', 'strong', 'em', 'code', 'pre', 'div', 'span', 'label']);
function renderNode(node) {
  if (node.nodeName === '#text') return escape(node.value);
  if (!node.tagName) return '';
  const children = () => (node.childNodes || []).map(renderNode).join('');
  if (displayTags.has(node.tagName)) return `<${node.tagName}>${children()}</${node.tagName}>`;
  if (node.tagName === 'a') return `<u>${children()}</u>`;
  if (node.tagName === 'form') return `<section>${children()}</section>`;
  if (node.tagName === 'button') return `<button disabled>${escape(text(node))}</button>`;
  if (node.tagName === 'input') return '<input disabled aria-label="Practice field (disabled)">';
  if (node.tagName === 'br') return '<br>';
  return '';
}
export function previewHTML(code) {
  let body = '<p>Preview is unavailable for this input. Use a smaller, simpler HTML example.</p>';
  if (typeof code === 'string' && code.length <= MAX_CODE_LENGTH) {
    try { body = parseExercise(code).childNodes.map(renderNode).join(''); }
    catch { /* Keep the bounded fallback rather than crashing the learner's screen. */ }
  }
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; form-action \'none\'; base-uri \'none\'"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Inert HTML practice preview</title></head><body>' + body + '</body></html>';
}

export function emptyProgress() { return { version: 1, read: {}, drafts: {}, solved: {}, lastLesson: null }; }
export function normalizeProgress(value) {
  const result = emptyProgress();
  if (!value || typeof value !== 'object' || value.version !== 1) return result;
  if (value.read && typeof value.read === 'object' && !Array.isArray(value.read)) {
    for (const [course, lessons] of Object.entries(value.read).slice(0, 20)) {
      if (validId(course) && Array.isArray(lessons)) result.read[course] = [...new Set(lessons.filter(validId))].slice(0, 50);
    }
  }
  for (const { id } of challenges) {
    const draft = value.drafts?.[id];
    if (typeof draft === 'string' && draft.length <= MAX_CODE_LENGTH) result.drafts[id] = draft;
    const solved = value.solved?.[id];
    if (typeof solved === 'string' && solved.length <= MAX_CODE_LENGTH && gradeChallenge(id, solved).passed) result.solved[id] = solved;
  }
  if (validId(value.lastLesson?.courseId) && validId(value.lastLesson?.lessonId)) result.lastLesson = { courseId: value.lastLesson.courseId, lessonId: value.lastLesson.lessonId };
  return result;
}
export function saveDraft(progress, id, code) {
  if (!challenges.some(item => item.id === id) || typeof code !== 'string' || code.length > MAX_CODE_LENGTH) return progress;
  return { ...progress, drafts: { ...progress.drafts, [id]: code } };
}
export function recordAttempt(progress, id, code) {
  const next = saveDraft(progress, id, code);
  return gradeChallenge(id, code).passed ? { ...next, solved: { ...next.solved, [id]: code } } : next;
}
export function recordRead(progress, courseId, lessonId, completed) {
  if (!validId(courseId) || !validId(lessonId)) return progress;
  const existing = progress.read[courseId] || [];
  return { ...progress, read: { ...progress.read, [courseId]: completed ? [...new Set([...existing, lessonId])] : existing.filter(id => id !== lessonId) }, lastLesson: { courseId, lessonId } };
}
export function rememberLesson(progress, courseId, lessonId) {
  return validId(courseId) && validId(lessonId) ? { ...progress, lastLesson: { courseId, lessonId } } : progress;
}
export function parseCatalog(value) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.courses) || value.courses.length > 20 || typeof value.training?.status !== 'string' || typeof value.payments?.enabled !== 'boolean') return null;
  const courses = [], courseIds = new Set();
  const short = (value, limit) => typeof value === 'string' && value.length <= limit;
  for (const course of value.courses) {
    if (!course || !validId(course.id) || courseIds.has(course.id) || !short(course.title, 200) || !short(course.summary, 2000) || !short(course.level, 100) || !short(course.format, 100) || !Array.isArray(course.lessons) || course.lessons.length > 50) return null;
    courseIds.add(course.id);
    const lessons = [], ids = new Set();
    for (const lesson of course.lessons) {
      if (!lesson || !validId(lesson.id) || ids.has(lesson.id) || !short(lesson.title, 200) || !Array.isArray(lesson.body) || lesson.body.length > 50 || !lesson.body.every(line => short(line, 10000))) return null;
      ids.add(lesson.id);
      lessons.push({ id: lesson.id, title: lesson.title, body: [...lesson.body] });
    }
    courses.push({ id: course.id, title: course.title, summary: course.summary, level: course.level, format: course.format, lessons });
  }
  const result = { courses, training: { status: value.training.status.slice(0, 100) }, payments: { enabled: value.payments.enabled } };
  return JSON.stringify(result).length <= 500000 ? result : null;
}

export const primer = {
  id: 'first-web-page', title: 'Your first web page', level: 'Beginner', format: 'Text introduction',
  summary: 'Understand what HTML does, give your content a clear structure, and choose the right element for the job.',
  lessons: [
    { id: 'structure-before-style', title: 'Structure before style', body: [
      'A web page begins with meaning. Before choosing colours or animations, decide what the page is for and what someone should be able to do. For a school page, that might be reading an introduction and finding a link to a lesson.',
      'HTML describes the structure of content. An element usually has an opening tag, some content, and a closing tag. In <h1>My first project</h1>, h1 identifies the main heading. The browser uses that structure to display the page, and assistive technology uses it to help people navigate.',
      'Use one clear main heading for this simple page, paragraphs for explanations, and a main element around the primary content. Headings should describe their sections; do not choose a heading level just to make text larger. CSS is the separate language that controls appearance.',
      'An anchor, such as <a href="/lessons">Read a lesson</a>, takes someone to a destination. A button performs an action, such as checking an answer or opening a menu. These elements have built-in keyboard behaviour. A clickable div does not provide the same meaning or behaviour on its own.',
      'Read the example from the outside in: main contains the page content, h1 names it, p explains it, and a provides a next step. In the practice lab, you can write your own version and check its structure. Learner JavaScript is never executed.'
    ] },
    { id: 'make-a-page-usable', title: 'Make a page usable', body: [
      'A page is not finished when it looks right on your own screen. Someone may use a small phone, zoom in, navigate with a keyboard, or listen with a screen reader. Clear structure is the starting point, not the entire accessibility check.',
      'Write links that explain their destination. Read the HTML introduction gives more information than Click here. Give every form input a visible label. Placeholder text disappears when someone types and is not a replacement for a label.',
      'Use flexible layouts instead of assuming a fixed screen width. Long text should wrap, controls should be easy to tap, and important information should not depend only on colour. When testing a page, navigate it with Tab and activate links with Enter.',
      'A useful first project is a one-page reading list: a main heading, a short explanation, and three descriptive links. First sketch the content. Then write the HTML. Only after the structure is clear should you add styles.',
      'Explain your choices: which content is a heading, which is a paragraph, and which elements lead to another destination? Being able to explain a small working page is more valuable than copying a complicated one you do not understand.'
    ] }
  ]
};
