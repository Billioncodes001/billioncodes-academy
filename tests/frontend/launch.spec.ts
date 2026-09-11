import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
// The mock uses the actual authored catalogue. No test fixtures ship in the UI.
// @ts-expect-error The backend's JavaScript catalogue is separately owned.
import { catalog } from '../../worker/catalog.js';

const artifacts = fileURLToPath(new URL('./artifacts/', import.meta.url));
const accepted = { accepted: true, id: '49cc82f0-a907-4f28-8907-6d3b0d280a95' };

async function noOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, viewport: window.innerWidth }));
  expect(overflow.page).toBeLessThanOrEqual(overflow.viewport);
}

async function accessible(page: Page) {
  await page.evaluate(async () => { await Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => undefined))); });
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
  await page.route('**/api/v1/catalog', route => route.fulfill({ json: catalog }));
});

test('home is responsive, accessible and has real preview screenshots', async ({ page }, testInfo) => {
  const exceptions: string[] = [];
  page.on('pageerror', error => exceptions.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Big ideas.');
  await page.evaluate(() => document.fonts.ready);
  await noOverflow(page);
  await accessible(page);
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
  await page.goto('/#/courses');
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
  await page.goto('/#/courses');
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
  await page.goto('/#/courses');
  await expect(page.getByRole('heading', { name: 'The live catalogue is unavailable.' })).toBeVisible();
  await page.goto('/#/missing');
  await expect(page.getByRole('heading', { name: 'This page is not here.' })).toBeVisible();
  await noOverflow(page);
});

test('application validation is labelled, focused, accessible and does not submit', async ({ page }) => {
  let writes = 0;
  await page.route('**/api/v1/applications', route => { writes++; return route.fulfill({ json: accepted, status: 201 }); });
  await page.goto('/#/training');
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
  await page.goto('/#/training');
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
  await page.goto('/#/training');
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
  await page.goto('/#/services');
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
  await page.goto('/#/learn/first-web-page');
  await expect(page.getByRole('button', { name: 'Check my answer' })).toBeDisabled();
  await page.getByRole('radio', { name: '<button>Reading list</button>' }).check();
  await page.getByRole('button', { name: 'Check my answer' }).click();
  await expect(page.locator('.practice-feedback')).toContainText('Not quite.');
  await page.getByRole('radio', { name: '<a href="/reading-list">Reading list</a>' }).check();
  await page.getByRole('button', { name: 'Check my answer' }).click();
  await expect(page.locator('.practice-feedback')).toContainText('Exactly.');
  await page.getByRole('button', { name: 'Mark as read on this device' }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Marked as read · undo' })).toBeVisible();
  await expect(page.getByText('Device-only progress.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: "Reset this introduction's progress" }).click();
  await expect(page.getByRole('button', { name: 'Mark as read on this device' })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('billioncodes:progress:v1:first-web-page') || '[]'))).toEqual([]);
});

test('blocked local storage is explained and does not break learning', async ({ page }) => {
  await page.addInitScript(() => { Storage.prototype.getItem = () => { throw new Error('blocked'); }; Storage.prototype.setItem = () => { throw new Error('blocked'); }; });
  await page.goto('/#/learn/first-web-page');
  await page.getByRole('button', { name: 'Mark as read on this device' }).click();
  await expect(page.getByText('Browser storage is unavailable.', { exact: false })).toBeVisible();
});

test('draft survives policy navigation but is never stored in local storage', async ({ page }) => {
  await page.goto('/#/training');
  await page.getByLabel('Full name').fill('Private Draft Name');
  await page.getByRole('link', { name: 'launch privacy notice' }).click();
  await page.goto('/#/training');
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
