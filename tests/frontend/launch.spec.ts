import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
// The mock uses the actual authored catalogue. No test fixtures ship in the UI.
// @ts-expect-error The backend's JavaScript catalogue is separately owned.
import { catalog } from '../../worker/catalog.js';
import { open } from './navigate';

const artifacts = fileURLToPath(new URL('./artifacts/', import.meta.url));
const accepted = { accepted: true, id: '49cc82f0-a907-4f28-8907-6d3b0d280a95' };

async function noOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, viewport: window.innerWidth }));
  expect(overflow.page).toBeLessThanOrEqual(overflow.viewport);
}

async function accessible(page: Page) {
  // Ambient background loops never finish, so wait only for entrance animations.
  await page.evaluate(async () => { await Promise.all(document.getAnimations().filter(animation => animation.effect?.getComputedTiming().endTime !== Infinity).map(animation => animation.finished.catch(() => undefined))); });
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(results.violations.map(item => ({ id: item.id, nodes: item.nodes.map(node => node.target) }))).toEqual([]);
}

async function fillApplication(page: Page) {
  await page.getByLabel('Full name').fill('Launch Test Learner');
  await page.getByLabel('Email address').fill('learner@example.com');
  await page.getByLabel('What would you like to learn?').fill('Web development');
  await page.getByLabel('Your experience so far').fill('I am new to coding.');
  await page.getByLabel('What would you like to be able to build?').fill('I want to build a simple reading list website.');
  await page.getByLabel('I agree that Billion Codes').check();
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api/v2/platform', route => route.fulfill({ json: { enabled:false, accountsReady:false } }));
  await page.route('**/api/v1/catalog', route => route.fulfill({ json: catalog }));
});

test('home is responsive, accessible and has real preview screenshots', async ({ page }, testInfo) => {
  test.setTimeout(60000);
  const exceptions: string[] = [];
  page.on('pageerror', error => exceptions.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Big ideas.');
  await page.evaluate(() => document.fonts.ready);
  await noOverflow(page);
  await accessible(page);
  for (const image of await page.locator('main img').all()) {
    await image.scrollIntoViewIfNeeded();
    await expect(image).toHaveJSProperty('complete', true);
    await expect.poll(() => image.evaluate(element => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  }
  await page.evaluate(() => scrollTo(0, 0));
  await mkdir(artifacts, { recursive: true });
  await page.screenshot({ path: `${artifacts}/${testInfo.project.name}-hero.png`, animations: 'disabled' });
  await page.screenshot({ path: `${artifacts}/${testInfo.project.name}-full.png`, fullPage: true, animations: 'disabled' });
  expect(exceptions).toEqual([]);
});

test('every public page has no accessibility violations or horizontal overflow', async ({ page }) => {
  for (const route of ['/courses', '/training', '/services', '/about', '/policies', '/learn/first-web-page', '/learn/web-foundations-intro']) {
    await page.goto(`/#${route}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByText('Loading the live catalogue...')).toHaveCount(0);
    await noOverflow(page);
    await accessible(page);
  }
});

test('catalogue searches, filters and renders authored API content', async ({ page }) => {
  await open(page, '/#/courses');
  await expect(page.getByRole('heading', { name: 'Your first steps in web development' })).toBeVisible();
  await page.getByLabel('Find an introduction').fill('nothing-matches-this');
  await expect(page.getByRole('heading', { name: 'No matching introductions.' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await page.getByLabel('Experience level').selectOption('Beginner');
  await page.getByRole('link', { name: /Your first steps in web development/ }).click();
  await expect(page.getByRole('heading', { name: '1. Understand a web page' })).toBeVisible();
  await page.getByRole('button', { name: /2. Build a clear, accessible page/ }).click();
  await expect(page.locator('.lesson-body')).toContainText('<!doctype html>');
  await expect(page.locator('.lesson-body h1')).toHaveCount(0);
  await noOverflow(page);
});

test('failed live catalogue is explained, built-in primer stays usable, retry works', async ({ page }) => {
  let failed = true;
  await page.route('**/api/v1/catalog', route => failed ? route.abort('failed') : route.fulfill({ json: catalog }));
  await open(page, '/#/courses');
  await expect(page.getByRole('heading', { name: 'The live catalogue is unavailable.' })).toBeVisible();
  await expect(page.getByText('No catalogue data has been substituted.', { exact: false })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your first steps in web development' })).toHaveCount(0);
  await page.getByRole('link', { name: /BUILT-IN FREE PRIMER/ }).click();
  await expect(page.getByRole('heading', { name: 'Structure before style' })).toBeVisible();
  await page.getByRole('link', { name: 'All introductions' }).click();
  failed = false;
  await page.getByRole('button', { name: 'Retry catalogue' }).click();
  await expect(page.getByRole('heading', { name: 'Your first steps in web development' })).toBeVisible();
});

test('malformed catalogue and unknown routes fail safely', async ({ page }) => {
  await page.route('**/api/v1/catalog', route => route.fulfill({ json: { courses: [{ id: 'bad' }] } }));
  await open(page, '/#/courses');
  await expect(page.getByRole('heading', { name: 'The live catalogue is unavailable.' })).toBeVisible();
  await open(page, '/#/missing');
  await expect(page.getByRole('heading', { name: 'This page is not here.' })).toBeVisible();
  await noOverflow(page);
});

test('application validation is labelled, focused, accessible and does not submit', async ({ page }) => {
  let writes = 0;
  await page.route('**/api/v1/applications', route => { writes++; return route.fulfill({ json: accepted, status: 201 }); });
  await open(page, '/#/training');
  await page.getByRole('button', { name: 'Send training application' }).click();
  await expect(page.getByRole('alert')).toBeFocused();
  await expect(page.getByLabel('Full name')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByLabel('Email address')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByLabel('I agree that Billion Codes')).toHaveAttribute('aria-invalid', 'true');
  expect(writes).toBe(0);
  await accessible(page);
  await noOverflow(page);
});

test('failure retains the draft, unchanged retry reuses its key, edits rotate the key', async ({ page }) => {
  const submissions: { key: string; body: Record<string, unknown> }[] = [];
  await page.route('**/api/v1/applications', async route => {
    submissions.push({ key: route.request().headers()['idempotency-key'], body: route.request().postDataJSON() });
    return submissions.length < 3 ? route.fulfill({ status: 503, json: { error: 'Service temporarily unavailable.' } }) : route.fulfill({ status: 201, json: accepted });
  });
  await open(page, '/#/training');
  await fillApplication(page);
  const send = page.getByRole('button', { name: 'Send training application' });
  await send.click();
  await expect(page.getByRole('alert')).toContainText('Your draft is still here.');
  await expect(page.getByLabel('Full name')).toHaveValue('Launch Test Learner');
  await send.click();
  await expect(page.getByRole('alert')).toContainText('Your draft is still here.');
  await page.getByLabel('Your experience so far').fill('I have built a small HTML page.');
  await send.click();
  await expect(page.getByRole('heading', { name: 'Thank you for reaching out.' })).toBeVisible();
  expect(submissions[0].key).toMatch(/^[0-9a-f-]{36}$/i);
  expect(submissions[0].key).toBe(submissions[1].key);
  expect(submissions[1].key).not.toBe(submissions[2].key);
  expect(submissions[2].body).toEqual({ name: 'Launch Test Learner', email: 'learner@example.com', track: 'Web development', format: 'undecided', experience: 'I have built a small HTML page.', goals: 'I want to build a simple reading list website.', consent: true, website: '' });
  await expect(page.getByText(accepted.id)).toBeVisible();
  await noOverflow(page);
  await accessible(page);
});

test('server field errors and email fallback remain visible', async ({ page }) => {
  await page.route('**/api/v1/applications', route => route.fulfill({ status: 422, json: { error: 'Please check your email.', fields: { email: 'The email address is not accepted.' } } }));
  await open(page, '/#/training');
  await fillApplication(page);
  await page.getByRole('button', { name: 'Send training application' }).click();
  await expect(page.locator('#email-error')).toHaveText('The email address is not accepted.');
  await expect(page.getByRole('link', { name: 'Email Josiah instead' })).toHaveAttribute('href', /^mailto:jhardeyemor@gmail.com/);
  await expect(page.getByLabel('Email address')).toHaveValue('learner@example.com');
  await noOverflow(page);
});

test('project enquiry uses only its agreed contract fields and does not promise a booking', async ({ page }) => {
  let body: Record<string, unknown> = {};
  await page.route('**/api/v1/project-requests', route => { body = route.request().postDataJSON(); return route.fulfill({ status: 201, json: accepted }); });
  await open(page, '/#/services');
  await page.getByRole('button', { name: 'Send project enquiry' }).click();
  await expect(page.getByRole('alert')).toContainText('Please check');
  await page.getByLabel('Full name').fill('Launch Test Founder');
  await page.getByLabel('Email address').fill('founder@example.com');
  await page.getByLabel('Type of support').selectOption('mentorship');
  await page.getByLabel('The project in one sentence').fill('Plan an accessible reading list');
  await page.getByLabel('The problem you want to solve').fill('I want guidance on structuring an accessible reading list for my own learning.');
  await page.getByLabel('Preferred target date').fill('2026-12-01');
  await page.getByLabel('I agree that Billion Codes').check();
  await page.getByRole('button', { name: 'Send project enquiry' }).click();
  await expect(page.getByRole('heading', { name: 'Thank you for reaching out.' })).toBeVisible();
  await expect(page.getByText('an accepted project or quote', { exact: false })).toBeVisible();
  expect(body.category).toBe('mentorship');
  expect(body.targetDate).toBe('2026-12-01');
  expect(body.consent).toBe(true);
  expect(body).not.toHaveProperty('track');
  expect(body).not.toHaveProperty('phone');
});

test('practice is deterministic and device-only progress persists and resets', async ({ page }) => {
  await open(page, '/#/learn/first-web-page');
  await expect(page.getByRole('button', { name: 'Check my answer' })).toBeDisabled();
  await page.getByRole('radio', { name: '<button>Reading list</button>' }).check();
  await page.getByRole('button', { name: 'Check my answer' }).click();
  await expect(page.locator('.practice-feedback')).toContainText('Not quite.');
  await page.getByRole('radio', { name: '<a href="/reading-list">Reading list</a>' }).check();
  await page.getByRole('button', { name: 'Check my answer' }).click();
  await expect(page.locator('.practice-feedback')).toContainText('Exactly.');
  await page.getByRole('button', { name: 'Mark as read on this device' }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('billioncodes:workspace:v1') || '{}').read?.['first-web-page']?.length)).toBe(1);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Marked as read · undo' })).toBeVisible();
  await expect(page.getByText('Device-only progress.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: "Reset this introduction's progress" }).click();
  await expect(page.getByRole('button', { name: 'Mark as read on this device' })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('billioncodes:progress:v1:first-web-page') || '[]'))).toEqual([]);
});

test('blocked local storage is explained and does not break learning', async ({ page }) => {
  await page.addInitScript(() => { Storage.prototype.getItem = () => { throw new Error('blocked'); }; Storage.prototype.setItem = () => { throw new Error('blocked'); }; });
  await open(page, '/#/learn/first-web-page');
  await page.getByRole('button', { name: 'Mark as read on this device' }).click();
  await expect(page.getByText('Browser storage is unavailable.', { exact: false })).toBeVisible();
});

test('draft survives policy navigation but is never stored in local storage', async ({ page }) => {
  await open(page, '/#/training');
  await page.getByLabel('Full name').fill('Private Draft Name');
  await page.getByRole('link', { name: 'launch privacy notice' }).click();
  await open(page, '/#/training');
  await expect(page.getByLabel('Full name')).toHaveValue('Private Draft Name');
  const storage = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
  expect(storage).not.toContain('Private Draft Name');
});

test('keyboard navigation and mobile menu are usable', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toBeFocused();
  if (testInfo.project.name === 'mobile-390') {
    await page.getByRole('button', { name: 'Menu' }).click();
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Menu' })).toBeFocused();
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).not.toBeVisible();
    await page.getByRole('button', { name: 'Menu' }).click();
    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Training', exact: true }).click();
  } else {
    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Training', exact: true }).click();
  }
  await expect(page.getByRole('heading', { name: 'Apply for training' })).toBeVisible();
  await expect(page.locator('main')).toBeFocused();
});

// The motion switch lives in the main navigation, which is collapsed behind Menu on phones.
async function openNavIfCollapsed(page: Page) {
  const menu = page.getByRole('button', { name: 'Menu' });
  if (await menu.isVisible()) await menu.click();
}

test('turning motion off also disables route transitions', async ({ page }) => {
  await page.goto('/');
  await openNavIfCollapsed(page);
  await page.getByRole('button', { name: 'Motion on' }).click();
  if (await page.getByRole('button', { name: 'Close' }).isVisible()) await page.keyboard.press('Escape');
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'off');
  await page.locator('.bc-hero-copy a[href="/courses"]').click();
  await expect(page.getByRole('heading', { name: /Start with understanding/ })).toBeVisible();
  await expect(page.locator('.route-curtain')).toHaveCount(0);
  expect(await page.locator('.route-view').evaluate(element => getComputedStyle(element).transform)).toBe('none');
});

test('home motion can be switched off and starts off under reduced motion', async ({ page, context }) => {
  await page.goto('/');
  await openNavIfCollapsed(page);
  const toggle = page.getByRole('button', { name: /^Motion (on|off)$/ });
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'on');
  await expect(page.getByRole('button', { name: /Play Debug Defender/ })).toBeVisible();
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'off');
  await expect(page.getByRole('button', { name: /Play Debug Defender/ })).toHaveCount(0);
  await expect(page.getByText('Motion is off. Turn it on in the header to play Debug Defender.')).toBeVisible();

  const fresh = await context.browser()!.newContext({ reducedMotion: 'reduce' });
  const reduced = await fresh.newPage();
  await reduced.goto(page.url());
  await expect(reduced.getByRole('heading', { level: 1 })).toContainText('Big ideas.');
  await expect(reduced.locator('html')).toHaveAttribute('data-motion', 'off');
  await openNavIfCollapsed(reduced);
  await expect(reduced.getByRole('button', { name: 'Motion off' })).toHaveAttribute('aria-pressed', 'false');
  await expect(reduced.locator('.cursor-ring, .scroll-progress')).toHaveCount(0);
  await reduced.goto(new URL('/#/courses', page.url()).href);
  await expect(reduced.getByRole('heading', { name: /Start with understanding/ })).toBeVisible();
  await expect(reduced.locator('.auto-reveal:not(.is-revealed)')).toHaveCount(0);
  await fresh.close();
});

test('Debug Defender leaderboard: idle challenge, panel, and score submission after a real game', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-1440', 'One full game is enough; the layout is covered elsewhere.');
  test.setTimeout(60000);
  const top = [{ rank: 1, id: '11111111-1111-4111-8111-111111111111', name: 'Grace', score: 2400, wave: 6, createdAt: '2026-10-08T10:00:00.000Z' }];
  let submitted: Record<string, unknown> | undefined;
  await page.route('**/api/v1/arcade/leaderboard?period=*', route => route.fulfill({ json: { entries: route.request().url().endsWith('week') ? [] : top } }));
  await page.route('**/api/v1/arcade/entries/*', route => route.fulfill({ json: { entry: top[0] } }));
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.route('**/api/v1/arcade/runs', route => route.fulfill({ status: 201, json: { runId: '22222222-2222-4222-8222-222222222222' } }));
  await page.route('**/api/v1/arcade/scores', route => {
    submitted = route.request().postDataJSON();
    const entry = { rank: 2, id: '33333333-3333-4333-8333-333333333333', name: submitted!.name, score: submitted!.score, wave: submitted!.wave, createdAt: '2026-10-08T11:00:00.000Z' };
    return route.fulfill({ status: 201, json: { accepted: true, entry, top: [...top, entry] } });
  });
  // The homepage leads with learning; the game is a secondary break.
  await page.goto('/');
  const paths = page.getByRole('navigation', { name: 'Where to start' });
  await expect(paths.getByRole('link')).toHaveCount(3);
  await expect(paths.getByRole('link', { name: /Your first web page/ })).toHaveAttribute('href', '/learn/first-web-page');
  await expect(paths.getByRole('link', { name: /The practice lab/ })).toHaveAttribute('href', '/practice');
  await expect(paths.getByRole('link', { name: /Training and expert help/ })).toHaveAttribute('href', '/training');
  await expect(page.getByText('Need a break?')).toBeVisible();
  await page.getByRole('button', { name: 'leaderboard', exact: true }).click();
  const panel = page.getByRole('dialog', { name: 'Debug Defender leaderboard' });
  await expect(panel.getByText('Grace')).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Close' })).toBeFocused();
  await panel.getByRole('button', { name: 'This week' }).click();
  await expect(panel.getByText('No scores yet. Be the first name on the board.')).toBeVisible();
  expect((await new AxeBuilder({ page }).include('.board-panel').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);

  // A friend's challenge link puts the game up front.
  await page.goto(`/?challenge=${top[0].id}`);
  await expect(page.locator('.game-challenge p')).toHaveText('Grace challenged you to beat 2,400 in Debug Defender.');
  await page.getByRole('button', { name: 'Accept the challenge' }).click();
  // Bugs spawn a moment after the wave starts; keep zapping until one is fixed.
  await expect.poll(async () => {
    await page.getByRole('button', { name: 'Zap nearest bug' }).click();
    return Number(await page.locator('.game-hud .hud-cell strong').first().innerText());
  }, { timeout: 15000 }).toBeGreaterThan(0);
  // Ending a scored run goes straight to game over, without waiting for the bugs to win.
  await page.getByRole('button', { name: 'End game' }).click();
  await expect(page.getByRole('dialog', { name: 'Game over' })).toBeVisible();
  const name = page.getByLabel('Put your score on the leaderboard');
  await name.fill('x');
  await expect(page.getByRole('button', { name: 'Submit score' })).toBeDisabled();
  await name.fill('Ada');
  await page.getByRole('button', { name: 'Submit score' }).click();
  await expect(page.getByText('You placed #2 all time.')).toBeVisible();
  await expect(page.locator('.board-list li.is-you')).toContainText('Ada');
  expect(submitted).toMatchObject({ runId: '22222222-2222-4222-8222-222222222222', name: 'Ada' });
  expect(Number(submitted!.score)).toBeGreaterThan(0);
  await expect(page.locator('.challenge-result')).toContainText('Grace');

  // Share: the card is drawn from the real result, the link carries the entry.
  await page.getByRole('button', { name: 'Share your score' }).click();
  const share = page.getByRole('dialog', { name: 'Share your score' });
  await expect(share.getByRole('button', { name: 'Close' })).toBeFocused();
  await expect(share.getByRole('img', { name: /Score card: \d+ points, wave \d+, by Ada, number 2 on the leaderboard/ })).toBeVisible();
  expect(await share.locator('canvas').evaluate(canvas => [(canvas as HTMLCanvasElement).width, (canvas as HTMLCanvasElement).height])).toEqual([1200, 630]);
  await share.getByRole('button', { name: 'Copy challenge link' }).click();
  await expect(share.getByText('Challenge copied. Paste it to a friend.')).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/Can you beat me\? https:\/\/learnatbillioncodes\.com\/c\/33333333-3333-4333-8333-333333333333$/);
  const download = page.waitForEvent('download');
  await share.getByRole('button', { name: 'Download image' }).click();
  expect((await download).suggestedFilename()).toBe('debug-defender-score.png');
  await expect(share.getByRole('link', { name: /WhatsApp/ })).toHaveAttribute('href', /^https:\/\/wa\.me\/\?text=.*learnatbillioncodes\.com%2Fc%2F33333333/);
  expect((await new AxeBuilder({ page }).include('.share-panel').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(share).toHaveCount(0);
});

test('pages have real addresses: links navigate in place, back works, and old #/ links still land correctly', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Where to start' }).getByRole('link', { name: /The practice lab/ }).click();
  await expect(page).toHaveURL(/\/practice$/);
  await expect(page.getByRole('heading', { name: 'Make it. Understand it.' })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Big ideas.');
  await open(page, '/#/learn/first-web-page');
  await expect(page).toHaveURL(/\/learn\/first-web-page$/);
  await expect(page.getByRole('heading', { name: 'Your first web page', level: 1 })).toBeVisible();
  await page.goto('/practice/reading-list');
  await expect(page.getByRole('heading', { name: 'Build a reading list', level: 1 })).toBeVisible();
  await page.goto('/?challenge=x#/courses');
  await expect(page).toHaveURL(/\/courses\?challenge=x$/);
});
