import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { createHarness, ADMIN, ORIGIN } from "./harness.mjs";

test("staff read the learning funnel in the console: steps, lessons, builds and periods", async () => {
  const app = await createHarness();
  let browser;
  try {
    const send = body => app.fetch("/api/v1/metrics", { method:"POST", headers:{ Origin:ORIGIN, "Content-Type":"application/json" }, body:JSON.stringify(body) });
    const seed = [[4, { event:"home_view" }], [2, { event:"start_path", subject:"practice" }], [3, { event:"lesson_view", subject:"first-web-page:structure-before-style" }], [1, { event:"lesson_complete", subject:"first-web-page:structure-before-style" }], [2, { event:"practice_view", subject:"profile-card" }], [1, { event:"practice_pass", subject:"profile-card" }], [1, { event:"game_play" }]];
    for (const [times, body] of seed) for (let i = 0; i < times; i++) assert.equal((await send(body)).status, 204);

    browser = await chromium.launch({ headless:true, executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined });
    const context = await browser.newContext();
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
    await page.getByRole("button", { name:"Learning funnel" }).click();
    const funnel = page.locator(".funnel");
    await funnel.waitFor();
    assert.match(await funnel.locator("li").first().innerText(), /Visited the homepage\s+4/);
    assert.match(await funnel.locator("li", { hasText:"Opened a lesson" }).innerText(), /3\s+75% of homepage visits/);
    assert.match(await page.locator("table", { hasText:"Lessons" }).innerText(), /first-web-page \/ structure-before-style\s+3\s+0\s+1\s+33%/);
    assert.match(await page.locator("table", { hasText:"Practice builds" }).innerText(), /profile-card\s+2\s+0\s+0\s+1\s+50%/);
    assert.match(await page.locator("#funnel-root").innerText(), /Played Debug Defender 1/);
    await page.getByRole("button", { name:"Last 7 days" }).click();
    await page.getByRole("button", { name:"Last 7 days", pressed:true }).waitFor();
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    await app.close();
  }
});
