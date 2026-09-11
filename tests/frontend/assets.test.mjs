import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

test('actual local Cloudflare assets emit CSP and all public routes render without violations', async () => {
  const origin = 'http://127.0.0.1:8788';
  const response = await fetch(origin);
  assert.equal(response.status, 200);
  const policy = response.headers.get('content-security-policy') || '';
  for (const directive of ["script-src 'self'", "style-src 'self'", "font-src 'self'", "connect-src 'self'", "object-src 'none'", "frame-ancestors 'none'"]) assert.ok(policy.includes(directive), `Missing ${directive}: ${policy}`);
  assert.ok(!policy.includes('unsafe-inline'));
  assert.ok(!policy.includes('unsafe-eval'));
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    const external = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (!request.url().startsWith(origin)) external.push(request.url()); });
    await page.addInitScript(() => { window.cspViolations = []; window.addEventListener('securitypolicyviolation', event => window.cspViolations.push(`${event.violatedDirective}: ${event.blockedURI}`)); });
    for (const route of ['/', '/#/courses', '/#/training', '/#/services', '/#/about', '/#/policies', '/#/learn/first-web-page', '/#/learn/web-foundations-intro']) {
      await page.goto(origin + route);
      await page.locator('h1').waitFor();
      await page.evaluate(() => document.fonts.ready);
      assert.equal(await page.locator('h1').count(), 1);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.deepEqual(await page.evaluate(() => window.cspViolations), []);
    }
    await page.goto(origin + '/#/courses');
    await page.getByRole('heading', { name: 'Your first steps in web development' }).waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
  } finally { await browser.close(); }
});
