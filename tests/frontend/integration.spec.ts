import { test, expect } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { extname, resolve, sep } from 'node:path';
// The backend owns this real Miniflare/workerd/D1 harness.
// @ts-expect-error JavaScript test harness has no declaration file.
import { createHarness } from '../../worker/tests/harness.mjs';

let server: Server;
let app: Awaited<ReturnType<typeof createHarness>>;
let origin: string;
const dist = fileURLToPath(new URL('../../dist/', import.meta.url));
const types: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff': 'font/woff', '.woff2': 'font/woff2', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const securityHeaders = Object.fromEntries((await readFile(new URL('../../public/_headers', import.meta.url), 'utf8')).split('\n').filter(line => /^\s+[^:]+:/.test(line)).map(line => { const index = line.indexOf(':'); return [line.slice(0, index).trim(), line.slice(index + 1).trim()]; }));

test.beforeAll(async () => {
  // A loopback-only transport bridge serves the real production build and forwards
  // every API call to workerd. API responses are never replaced with test fixtures.
  server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url || '/', origin);
      if (url.pathname.startsWith('/api/')) {
        const chunks = [];
        for await (const chunk of request) chunks.push(Buffer.from(chunk));
        const headers = new Headers();
        for (const [key, value] of Object.entries(request.headers)) {
          if (value !== undefined && !['host', 'connection', 'content-length'].includes(key)) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
        }
        const body = Buffer.concat(chunks);
        const result = await app.fetch(url.pathname + url.search, { method: request.method, headers, ...(body.length ? { body } : {}) });
        response.writeHead(result.status, Object.fromEntries(result.headers));
        response.end(Buffer.from(await result.arrayBuffer()));
        return;
      }
      const target = resolve(dist, url.pathname === '/' ? 'index.html' : `.${decodeURIComponent(url.pathname)}`);
      if (!target.startsWith(resolve(dist) + sep)) { response.writeHead(403); response.end(); return; }
      const data = await readFile(target);
      response.writeHead(200, { ...securityHeaders, 'Content-Type': types[extname(target)] || 'application/octet-stream' });
      response.end(data);
    } catch (error) { response.writeHead(500); response.end(error instanceof Error ? error.message : 'Local test server error'); }
  });
  await new Promise<void>(ready => server.listen(0, '127.0.0.1', ready));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Local bridge did not get a port.');
  origin = `http://127.0.0.1:${address.port}`;
  app = await createHarness({ ALLOWED_ORIGINS: origin });
});

test.afterAll(async () => {
  if (server) await new Promise<void>((ready, reject) => server.close(error => error ? reject(error) : ready()));
  if (app) await app.close();
});

test('production frontend submits both forms to real Worker/D1 and isolates their state', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto(`${origin}/#/courses`);
  await expect(page.getByRole('heading', { name: 'Your first steps in web development' })).toBeVisible();
  expect((await page.request.get(`${origin}/api/health`)).status()).toBe(200);
  await page.goto(`${origin}/#/training`);
  await page.getByLabel('Full name').fill('Integration Learner');
  await page.goto(`${origin}/#/services`);
  await expect(page.getByLabel('Full name')).toHaveValue('');
  await page.getByLabel('Full name').fill('Integration Founder');
  await page.goto(`${origin}/#/training`);
  await expect(page.getByLabel('Full name')).toHaveValue('Integration Learner');
  await page.getByLabel('Email address').fill('learner@example.com');
  await page.getByLabel('What would you like to learn?').fill('Web development');
  await page.getByLabel('Preferred training format').selectOption('online');
  await page.getByLabel('Your experience so far').fill('I am starting with HTML.');
  await page.getByLabel('What would you like to be able to build?').fill('I want to build an accessible community reading list.');
  await page.getByLabel('I agree that Billion Codes').check();
  const applicationResponse = page.waitForResponse(response => response.url().endsWith('/api/v1/applications') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Send training application' }).click();
  const applicationResult = await applicationResponse;
  expect(applicationResult.status()).toBe(201);
  const applicationReceipt = await applicationResult.json();
  await expect(page.getByText(applicationReceipt.id)).toBeVisible();
  const applicationRow = await app.db.prepare('SELECT kind, data_json FROM submissions WHERE id = ?').bind(applicationReceipt.id).first();
  expect(applicationRow.kind).toBe('applications');
  expect(JSON.parse(applicationRow.data_json)).toMatchObject({ name: 'Integration Learner', email: 'learner@example.com', format: 'online', consent: true });

  await page.goto(`${origin}/#/services`);
  await expect(page.getByLabel('Full name')).toHaveValue('Integration Founder');
  await page.getByLabel('Email address').fill('founder@example.com');
  await page.getByLabel('Type of support').selectOption('business-software');
  await page.getByLabel('The project in one sentence').fill('An accessible reading list for our small team');
  await page.getByLabel('The problem you want to solve').fill('We need a simple public list of useful learning resources, with clear headings and accessible navigation.');
  await page.getByLabel('I agree that Billion Codes').check();
  const projectResponse = page.waitForResponse(response => response.url().endsWith('/api/v1/project-requests') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Send project enquiry' }).click();
  const projectResult = await projectResponse;
  expect(projectResult.status()).toBe(201);
  const projectReceipt = await projectResult.json();
  await expect(page.getByText(projectReceipt.id)).toBeVisible();
  expect(projectReceipt.id).not.toBe(applicationReceipt.id);
  const projectRow = await app.db.prepare('SELECT kind, data_json FROM submissions WHERE id = ?').bind(projectReceipt.id).first();
  expect(projectRow.kind).toBe('project-requests');
  expect(JSON.parse(projectRow.data_json)).toMatchObject({ name: 'Integration Founder', category: 'business-software', consent: true });
  expect((await app.db.prepare('SELECT COUNT(*) AS count FROM submissions').first()).count).toBe(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(pageErrors).toEqual([]);
});

test('production offline app works without caching APIs, admin or form drafts', async ({ page, context }) => {
  await page.goto(`${origin}/#/workspace`);
  await page.getByRole('button', { name: 'Save current catalogue' }).click();
  await page.getByRole('button', { name: 'Enable offline reading' }).click();
  await expect(page.getByText('The app shell and built-in exercises are ready offline.', { exact: false })).toBeVisible({ timeout: 20000 });
  await page.goto(`${origin}/#/training`);
  await page.getByLabel('Full name').fill('Never cache this private draft');
  await context.setOffline(true);
  await page.goto(`${origin}/#/workspace`);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'A little progress. A little more possibility.' })).toBeVisible();
  await page.goto(`${origin}/#/courses`);
  await expect(page.getByText('Reading your saved catalogue', { exact: false })).toBeVisible();
  await page.goto(`${origin}/#/practice/profile-card`);
  await page.getByLabel('Your HTML').fill('<main><h1>Works offline</h1><p>Meaningful HTML from anywhere.</p></main>');
  await page.getByRole('button', { name: 'Check my build' }).click();
  await expect(page.getByRole('heading', { name: 'You made it work.' })).toBeVisible();
  await expect(page.frameLocator('iframe').getByRole('heading', { name: 'Works offline' })).toBeVisible();
  const cached = await page.evaluate(async () => {
    const entries = [];
    for (const name of await caches.keys()) for (const request of await (await caches.open(name)).keys()) entries.push(new URL(request.url).pathname);
    return entries;
  });
  expect(cached.length).toBeGreaterThan(5);
  expect(cached.some(path => /admin|api\//i.test(path))).toBe(false);
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toContain('Never cache this private draft');
  expect(await page.evaluate(async () => { try { await fetch('/api/v1/admin/submissions'); return 'unexpected cache'; } catch { return 'offline'; } })).toBe('offline');
  await context.setOffline(false);
  await page.goto(`${origin}/#/workspace`);
  await page.getByRole('button', { name: 'Remove offline app files' }).click();
  await expect(page.getByText('Offline app files removed.', { exact: false })).toBeVisible();
  expect(await page.evaluate(() => caches.keys())).toEqual([]);
});
