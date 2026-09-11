import { test, expect } from '@playwright/test';
import { parseCatalog } from '@billioncodes/learning';

test('@live native-style public GET and real browser training page need no submission', async ({ page, request }) => {
  const response = await request.get('https://learnatbillioncodes.com/api/v1/catalog');
  expect(response.status()).toBe(200);
  expect(parseCatalog(await response.json())).not.toBeNull();
  await page.goto('/');
  await page.getByRole('tab', { name: 'Device', exact: true }).click();
  const opened = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Training on the web' }).click();
  const browser = await opened;
  await browser.waitForLoadState('domcontentloaded');
  await expect(browser).toHaveURL('https://learnatbillioncodes.com/#/training');
  await expect(browser.locator('form')).toBeVisible();
});

test('@live cross-origin Expo web catalog read requires backend GET allowlist', async ({ page, request }) => {
  const policy = await request.get('https://learnatbillioncodes.com/api/v1/catalog', { headers: { Origin: 'http://127.0.0.1:8091' } });
  expect(policy.status(), 'The public backend currently rejects the preview Origin. Only its owner may change GET CORS policy; never weaken POST checks.').toBe(200);
  const errors: string[] = [];
  const writes: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (request.method() !== 'GET') writes.push(request.url()); });
  const response = page.waitForResponse('https://learnatbillioncodes.com/api/v1/catalog');
  await page.goto('/');
  const actual = await response;
  expect(actual.status()).toBe(200);
  const catalog = await actual.json();
  expect(catalog.courses.length).toBeGreaterThan(0);
  await expect(page.getByText('LIVE CATALOG', { exact: true })).toBeVisible();
  const title: string = catalog.courses[0].title;
  await page.getByRole('button', { name: `Read ${title}` }).click();
  await expect(page.getByText(catalog.courses[0].lessons[0].body[0], { exact: true })).toBeVisible();
  await page.screenshot({ path: 'evidence/reader-live-phone.png', fullPage: true });
  await page.getByRole('tab', { name: 'Device', exact: true }).click();
  const opened = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Training on the web' }).click();
  const browser = await opened;
  await browser.waitForLoadState('domcontentloaded');
  await expect(browser).toHaveURL('https://learnatbillioncodes.com/#/training');
  await expect(browser.locator('form')).toBeVisible();
  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
});
