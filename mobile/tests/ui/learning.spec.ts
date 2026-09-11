import { test, expect, type Page } from '@playwright/test';
import { challenges, primer, WORKSPACE_KEY, CATALOG_KEY } from '@billioncodes/learning';

const url = 'https://learnatbillioncodes.com/api/v1/catalog';
const catalog = { courses: [{ ...primer, id: 'catalog-fixture', title: 'Catalog fixture lessons' }], training: { status: 'applications-open' }, payments: { enabled: false } };
const progressKey = `native:${WORKSPACE_KEY}`;
const downloadKey = `native:${CATALOG_KEY}`;
const solution = '<main><h1>My introduction</h1><p>I build useful things.</p></main>';
async function catalogReady(page: Page) {
  await page.route(url, route => route.fulfill({ json: catalog }));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Small steps. Real understanding.' })).toBeVisible();
}

test('native desk renders at phone and tablet widths without horizontal overflow', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await catalogReady(page);
  await expect(page.getByTestId('brand-monogram')).toBeVisible();
  await expect.poll(() => page.getByTestId('brand-monogram').evaluate(element => {
    const image = element instanceof HTMLImageElement ? element : element.querySelector('img');
    return image?.complete && image.naturalWidth === 192 && image.naturalHeight === 192;
  })).toBe(true);
  await expect(page.getByRole('button', { name: 'Read Catalog fixture lessons' })).toBeAttached();
  await page.screenshot({ path: 'evidence/desk-phone.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1024, height: 1000 });
  await page.screenshot({ path: 'evidence/desk-tablet-web.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('read marks, resume and HTML drafts survive reload; all four editors use shared feedback', async ({ page }) => {
  await catalogReady(page);
  await page.getByRole('button', { name: 'Begin the HTML primer' }).click();
  await page.getByRole('button', { name: 'Mark lesson as read' }).click();
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{}').read, progressKey)).toEqual({ [primer.id]: [primer.lessons[0].id] });
  await page.getByRole('tab', { name: 'Practice', exact: true }).click();
  for (const [index, item] of challenges.entries()) {
    await page.getByRole('button', { name: `Exercise ${index + 1}: ${item.title}` }).click();
    await expect(page.getByTestId('html-editor')).toHaveValue(item.starter);
    await page.getByRole('button', { name: 'Check my HTML' }).click();
    for (const goal of item.goals) await expect(page.getByText(goal, { exact: true })).toBeVisible();
  }
  await page.getByRole('button', { name: `Exercise 1: ${challenges[0].title}` }).click();
  await page.getByTestId('html-editor').fill(solution);
  await page.getByRole('button', { name: 'Check my HTML' }).click();
  await expect(page.getByText('ALL GOALS MET / ON THIS ATTEMPT')).toBeVisible();
  await page.screenshot({ path: 'evidence/practice-phone.png', fullPage: true });
  await page.getByRole('tab', { name: 'Desk', exact: true }).click();
  await page.getByRole('tab', { name: 'Practice', exact: true }).click();
  await page.screenshot({ path: 'evidence/practice-overview-phone.png', fullPage: true });
  await page.reload();
  await page.getByRole('button', { name: 'Continue last lesson' }).click();
  await expect(page.getByRole('button', { name: 'Unmark as read' })).toBeVisible();
  await page.getByRole('tab', { name: 'Practice', exact: true }).click();
  await expect(page.getByTestId('html-editor')).toHaveValue(solution);
});

test('download is explicit; saved catalog survives network failure and independent confirmed resets', async ({ page }) => {
  await catalogReady(page);
  expect(await page.evaluate(key => localStorage.getItem(key), downloadKey)).toBeNull();
  await page.getByRole('button', { name: 'Download catalog', exact: true }).click();
  await expect.poll(() => page.evaluate(key => !!localStorage.getItem(key), downloadKey)).toBe(true);
  await page.getByRole('button', { name: 'Begin the HTML primer' }).click();
  await page.getByRole('button', { name: 'Mark lesson as read' }).click();
  await page.unroute(url);
  await page.route(url, route => route.abort('internetdisconnected'));
  await page.reload();
  await expect(page.getByText('SAVED CATALOG', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Read Catalog fixture lessons' })).toBeVisible();
  await page.getByRole('tab', { name: 'Device', exact: true }).click();
  await expect(page.getByTestId('saved-date')).toContainText('Saved');
  await page.getByTestId('saved-date').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'evidence/device-offline-phone.png', fullPage: true });
  await page.getByRole('button', { name: 'Reset learning progress' }).click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(await page.evaluate(key => localStorage.getItem(key), progressKey)).not.toBeNull();
  await page.getByRole('button', { name: 'Reset learning progress' }).click();
  await page.getByRole('button', { name: 'Confirm reset' }).click();
  await expect.poll(() => page.evaluate(key => localStorage.getItem(key), progressKey)).toBeNull();
  expect(await page.evaluate(key => localStorage.getItem(key), downloadKey)).not.toBeNull();
  await page.getByRole('button', { name: 'Remove saved catalog' }).click();
  await page.getByRole('button', { name: 'Confirm reset' }).click();
  await expect.poll(() => page.evaluate(key => localStorage.getItem(key), downloadKey)).toBeNull();
  await expect(page.getByText('No catalog saved.', { exact: false })).toBeVisible();
});

test('unreadable progress is never silently overwritten and can be explicitly reset', async ({ page }) => {
  await page.addInitScript(key => localStorage.setItem(key, '{corrupt'), progressKey);
  await catalogReady(page);
  await expect(page.getByText(/Nothing has been overwritten/)).toBeVisible();
  await page.getByRole('tab', { name: 'Practice', exact: true }).click();
  await expect(page.getByTestId('html-editor')).not.toBeEditable();
  expect(await page.evaluate(key => localStorage.getItem(key), progressKey)).toBe('{corrupt');
  await page.getByRole('tab', { name: 'Device', exact: true }).click();
  await page.getByRole('button', { name: 'Reset learning progress' }).click();
  await page.getByRole('button', { name: 'Confirm reset' }).click();
  await page.getByRole('tab', { name: 'Practice', exact: true }).click();
  await expect(page.getByTestId('html-editor')).toBeEditable();
});

test('learner scripts and URLs stay inert; training opens the public web form without a POST', async ({ page }) => {
  const writes: string[] = [];
  page.on('request', request => { if (request.method() !== 'GET') writes.push(request.url()); });
  await catalogReady(page);
  await page.getByRole('tab', { name: 'Practice', exact: true }).click();
  await page.getByTestId('html-editor').fill(solution + '<script>window.__learnerExecuted=true</script><img src="https://untrusted.invalid/image">');
  await page.getByRole('button', { name: 'Check my HTML' }).click();
  await expect(page.getByText('KEEP BUILDING / GOAL FEEDBACK')).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as Record<string, unknown>).__learnerExecuted)).toBeUndefined();
  await expect(page.locator('iframe, webview')).toHaveCount(0);
  await page.getByRole('tab', { name: 'Device', exact: true }).click();
  await page.context().route('https://learnatbillioncodes.com/', route => route.fulfill({ body: '<html><body>Public training page test interception</body></html>', contentType: 'text/html' }));
  const popup = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Training on the web' }).click();
  const browser = await popup;
  await expect(browser).toHaveURL('https://learnatbillioncodes.com/#/training');
  expect(writes).toEqual([]);
});
