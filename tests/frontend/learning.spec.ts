import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
// @ts-expect-error Published Worker catalogue has a JS definition.
import { catalog } from '../../worker/catalog.js';

const solution = '<main><h1>A community reading club</h1><p>One chapter and one conversation each week.</p></main>';
test.beforeEach(async ({ page }) => { await page.route('**/api/v2/platform', route => route.fulfill({ json: { enabled:false, accountsReady:false } })); await page.route('**/api/v1/catalog', route => route.fulfill({ json: catalog })); });

test('new learning pages are accessible and fit the viewport', async ({ page }) => {
  for (const route of ['/workspace', '/practice', '/practice/profile-card', '/practice/contact-form', '/credits']) {
    await page.goto(`/#${route}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByText('Loading the live catalogue...')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    // Learner-authored preview is deliberately script-disabled. Audit the app, not arbitrary learner markup.
    const scan = await new AxeBuilder({ page }).exclude('iframe').options({ iframes: false }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(scan.violations.map(item => ({ id: item.id, targets: item.nodes.map(node => node.target) }))).toEqual([]);
  }
});
test('real practice grades, previews, persists and safely resets a draft', async ({ page }) => {
  await page.goto('/#/practice/profile-card');
  await page.getByRole('button', { name: 'Check my build' }).click();
  await expect(page.getByRole('heading', { name: 'A few things to work on.' })).toBeVisible();
  await page.getByLabel('Your HTML').fill(solution);
  await expect(page.frameLocator('iframe').getByRole('heading', { name: 'A community reading club' })).toBeVisible();
  await page.getByRole('button', { name: 'Check my build' }).click();
  await expect(page.getByRole('heading', { name: 'You made it work.' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('billioncodes:workspace:v1') || '{}').solved?.['profile-card'])).toBe(solution);
  await page.reload();
  await expect(page.getByLabel('Your HTML')).toHaveValue(solution);
  await page.getByRole('button', { name: 'Reset code', exact: true }).click();
  await page.getByRole('button', { name: 'Keep editing' }).click();
  await expect(page.getByLabel('Your HTML')).toHaveValue(solution);
  await page.getByRole('button', { name: 'Reset code', exact: true }).click();
  await page.getByRole('button', { name: 'Replace draft' }).click();
  await expect(page.getByLabel('Your HTML')).not.toHaveValue(solution);
  await page.goto('/#/workspace');
  await expect(page.getByText('Completed once', { exact: false }).last()).toBeVisible();
});
test('hostile practice is inert and never makes a network request', async ({ page }) => {
  let probes = 0;
  await page.route('https://example.com/**', route => { probes++; return route.abort(); });
  await page.goto('/#/practice/profile-card');
  await page.getByLabel('Your HTML').fill(solution + '<script>parent.location="https://example.com/probe"</script><img src="https://example.com/pixel" onerror="alert(1)"><a href="https://example.com/track">Tracking link</a>');
  await page.getByRole('button', { name: 'Check my build' }).click();
  await expect(page.getByText('Try again: Keep this HTML exercise', { exact: false })).toBeVisible();
  await expect(page.frameLocator('iframe').locator('a, img, script')).toHaveCount(0);
  expect(probes).toBe(0);
  await expect(page).toHaveURL(/practice\/profile-card/);
});
test('explicit catalogue save survives network failure, and reset needs confirmation', async ({ page }) => {
  await page.goto('/#/workspace');
  await page.getByRole('button', { name: 'Save current catalogue' }).click();
  await expect(page.getByText(/^Saved on /)).toBeVisible();
  await page.route('**/api/v1/catalog', route => route.abort());
  await page.goto('/#/courses');
  await page.reload();
  await expect(page.getByText('Reading your saved catalogue', { exact: false })).toBeVisible();
  await page.goto('/#/practice/profile-card');
  await page.getByLabel('Your HTML').fill(solution);
  await page.goto('/#/workspace');
  await page.getByRole('button', { name: 'Reset all learning progress' }).click();
  await page.getByRole('button', { name: 'Keep my progress' }).click();
  await page.goto('/#/practice/profile-card');
  await expect(page.getByLabel('Your HTML')).toHaveValue(solution);
  await page.goto('/#/workspace');
  await page.getByRole('button', { name: 'Reset all learning progress' }).click();
  await page.getByRole('button', { name: 'Clear local progress' }).click();
  await page.goto('/#/practice/profile-card');
  await expect(page.getByLabel('Your HTML')).not.toHaveValue(solution);
});
test('learning backups restore only after confirmation and validate completions', async ({ page }) => {
  await page.goto('/#/workspace');
  const backup = { version: 1, read: {}, drafts: { 'profile-card': solution, 'reading-list': '\u0000'.repeat(12000), 'contact-form': '\u0000'.repeat(12000), 'semantic-repair': '\u0000'.repeat(12000) }, solved: { 'profile-card': true }, lastLesson: null };
  expect(Buffer.byteLength(JSON.stringify(backup))).toBeGreaterThan(200000);
  await page.getByLabel('Import a learning backup').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  await expect(page.getByText('0 validated completed exercises', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Replace with backup' }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export learning backup' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('billioncodes-learning-backup.json');
  const chunks = [];
  for await (const chunk of (await download.createReadStream())!) chunks.push(chunk);
  const exported = JSON.parse(Buffer.concat(chunks).toString());
  expect(exported.drafts).toEqual(backup.drafts);
  expect(exported.solved).toEqual({});
  await page.goto('/#/practice/profile-card');
  await expect(page.getByLabel('Your HTML')).toHaveValue(solution);
});
test('homepage text preview treats markup as text', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('What would you like to build?').fill('<img src=x onerror=alert(1)>');
  await expect(page.locator('.first-win-output strong')).toHaveText('<img src=x onerror=alert(1)>');
  await expect(page.locator('.first-win-output img')).toHaveCount(0);
});
test('generated imagery is disclosed without attributing fictional scenes to stock photographers', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.photo-disclaimer')).toContainText('AI-generated imagery');
  await page.getByRole('link', { name: 'About the visuals', exact: true }).click();
  await expect(page).toHaveTitle(/About the imagery/);
  await expect(page.getByRole('heading', { name: 'Imagined with purpose. Made for Billion Codes.' })).toBeVisible();
  await expect(page.getByText('The people and settings are fictional', { exact: false })).toBeVisible();
  await expect(page.getByText('The founder portrait is a real, owner-provided photograph', { exact: false })).toBeVisible();
  await expect(page.locator('.credits-grid img')).toHaveCount(3);
  for (const image of await page.locator('.credits-grid img').all()) {
    await image.scrollIntoViewIfNeeded();
    await expect(image).toHaveAttribute('alt', /^AI-generated/);
    await expect(image).toHaveAttribute('src', /-generated-v1\.webp$/);
    await expect.poll(() => image.evaluate(element => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  }
  await expect(page.locator('a[href*="unsplash.com"]')).toHaveCount(0);
  await page.goto('/#/courses');
  await expect(page.locator('.course-cover img').first()).toBeVisible();
  for (const image of await page.locator('.course-cover img').all()) {
    await image.scrollIntoViewIfNeeded();
    const source = await image.getAttribute('src');
    if (source?.startsWith('/images/')) expect(source).toMatch(/-generated-v1\.webp$/);
    await expect.poll(() => image.evaluate(element => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  }
});
test('small phones and intermediate tablet widths preserve layout and loaded imagery', async ({ page }) => {
  for (const width of [320, 768, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.locator('.founder-real').scrollIntoViewIfNeeded();
    await expect.poll(() => page.locator('.founder-real img').evaluate(element => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    const caption = await page.locator('.photo-caption').boundingBox();
    const card = await page.locator('.hero-build-card').boundingBox();
    expect(caption!.y + caption!.height).toBeLessThanOrEqual(card!.y);
  }
});
test('large escaped drafts survive reload and independent tabs do not overwrite one another', async ({ page, context }) => {
  await page.goto('/#/practice/profile-card');
  await page.evaluate(async () => {
    // @ts-expect-error This runtime import intentionally uses Vite's source module in the local test server.
    const store = await import('/src/learningStore.ts');
    store.changeProgress((state: object) => ({ ...state, drafts: { 'profile-card': '\u0000'.repeat(12000), 'reading-list': '\u0000'.repeat(12000), 'contact-form': '\u0000'.repeat(12000) } }));
  });
  await expect.poll(() => page.evaluate(() => localStorage.getItem('billioncodes:workspace:v1')?.length || 0)).toBeGreaterThan(200000);
  await page.reload();
  await expect(page.getByLabel('Your HTML')).toHaveValue('\u0000'.repeat(12000));
  const second = await context.newPage();
  await second.goto('/#/practice/reading-list');
  // Simultaneous keyboard input shares browser focus; call the actual store instead to isolate persistence concurrency.
  await Promise.all([page, second].map((tab, index) => tab.evaluate(async ({ index, solution }) => {
    // @ts-expect-error Runtime source import under Vite.
    const store = await import('/src/learningStore.ts');
    const id = index ? 'reading-list' : 'profile-card';
    const code = index ? '<h1>A separate reading list</h1>' : solution;
    store.changeProgress((state: { drafts: object }) => ({ ...state, drafts: { ...state.drafts, [id]: code } }));
  }, { index, solution })));
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('billioncodes:workspace:v1') || '{}').drafts['reading-list'])).toBe('<h1>A separate reading list</h1>');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('billioncodes:workspace:v1') || '{}').drafts['profile-card'])).toBe(solution);
  await second.close();
});
