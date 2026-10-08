import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { createHarness, ADMIN, ORIGIN } from "./harness.mjs";

test("staff moderate the Debug Defender leaderboard from the console: hide, show and delete", async () => {
  const app = await createHarness();
  let browser;
  try {
    const run = await (await app.fetch("/api/v1/arcade/runs", { method:"POST", headers:{ Origin:ORIGIN } })).json();
    const submitted = await app.fetch("/api/v1/arcade/scores", { method:"POST", headers:{ Origin:ORIGIN, "Content-Type":"application/json" }, body:JSON.stringify({ runId:run.runId, name:"Rude Player", score:70, wave:1 }) });
    assert.equal(submitted.status, 201);
    const publicCount = async () => (await (await app.fetch("/api/v1/arcade/leaderboard")).json()).entries.length;

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
    await page.getByRole("button", { name:"Leaderboard", exact:true }).click();
    await page.getByText("Latest scores (1)").waitFor();
    await page.getByRole("button", { name:"Hide Rude Player (70 points)" }).click();
    await page.getByText("Rude Player is hidden from the public leaderboard.").waitFor();
    assert.equal(await publicCount(), 0);
    await page.getByRole("button", { name:"Show Rude Player (70 points)" }).click();
    await page.getByText("Rude Player is back on the public leaderboard.").waitFor();
    assert.equal(await publicCount(), 1);
    page.once("dialog", dialog => dialog.accept());
    await page.getByRole("button", { name:"Delete Rude Player (70 points)" }).click();
    await page.getByText("No scores have been submitted yet.").waitFor();
    assert.equal(await publicCount(), 0);
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    await app.close();
  }
});
