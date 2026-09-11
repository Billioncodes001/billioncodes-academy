import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { createHarness, application, post, ADMIN, ORIGIN } from "./harness.mjs";

test("admin browser console authenticates, renders hostile text safely, audits and clears memory", async () => {
  const app = await createHarness();
  let browser;
  try {
    const xss = '<img src=x onerror="window.xssFired=true"> Build a useful website.';
    const submission = await app.fetch("/api/v1/applications", post(application({ goals:xss })));
    assert.equal(submission.status, 201);
    browser = await chromium.launch({ headless:true, executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined });
    const context = await browser.newContext();
    // Intercept every request: the browser never contacts the real public domain.
    await context.route("**/*", async route => {
      const request = route.request();
      if (!request.url().startsWith(ORIGIN + "/")) return route.abort();
      const response = await app.fetch(request.url().slice(ORIGIN.length), { method:request.method(), headers:await request.allHeaders(), ...(request.postDataBuffer() ? { body:request.postDataBuffer() } : {}) });
      await route.fulfill({ status:response.status, headers:Object.fromEntries(response.headers), body:Buffer.from(await response.arrayBuffer()) });
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(ORIGIN + "/admin");
    await page.locator("#token").fill(ADMIN);
    await page.locator("#unlock").click();
    await page.locator("#records article").waitFor();
    assert.equal(await page.locator("#token").inputValue(), "");
    assert.ok((await page.locator("#records").innerText()).includes(xss));
    assert.equal(await page.locator("#records img").count(), 0);
    assert.equal(await page.evaluate(() => window.xssFired), undefined);
    assert.deepEqual(await page.evaluate(() => [localStorage.length, sessionStorage.length]), [0,0]);
    await page.locator("#records article select").selectOption("contacted");
    await page.getByRole("button", { name:"Save status", exact:true }).click();
    await page.getByText("Status saved. Refresh the inbox to reapply filters.").waitFor();
    await page.locator("#records details summary").click();
    await page.getByRole("button", { name:"Load status history" }).click();
    await page.getByText(/new to contacted by admin/).waitFor();
    await page.setViewportSize({ width:390, height:844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.locator("#lock").click();
    assert.equal(await page.locator("#records article").count(), 0);
    assert.equal(await page.locator("#review-panel").isVisible(), false);
    await page.reload();
    assert.equal(await page.locator("#token").inputValue(), "");
    assert.equal(await page.locator("#review-panel").isVisible(), false);
    assert.deepEqual(errors, []);
    await context.close();
  } finally {
    if (browser) await browser.close();
    await app.close();
  }
});
