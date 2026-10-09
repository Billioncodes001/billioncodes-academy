import type { Page } from '@playwright/test';

// Moves within the already-open app, like following an in-app link. Sign-in and form drafts are
// held in memory by design, so a full page load (page.goto to another path) would end them.
// Accepts "/#/route", "/route" or an absolute URL; loads the page first if it is not open yet.
export async function open(page: Page, route: string) {
  const current = /^https?:/.test(page.url()) ? new URL(page.url()) : null;
  const target = new URL(route.replace(/\/#\//, '/'), current?.origin || 'http://placeholder');
  if (!current || (/^https?:/.test(route) && target.origin !== current.origin)) { await page.goto(route); return; }
  const path = target.pathname + target.search;
  await page.evaluate(next => { window.location.hash = next; }, path);
  await page.waitForFunction(next => window.location.pathname + window.location.search === next, path);
}
