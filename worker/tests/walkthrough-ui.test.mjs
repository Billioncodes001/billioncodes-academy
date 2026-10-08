import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { createHarness, ADMIN, ORIGIN, admin } from "./harness.mjs";

test("course studio: an editor adds a code walkthrough to a reading lesson and fixes a rejected step", async () => {
  const app = await createHarness({ LEARNING_PLATFORM:"enabled" }, { r2Buckets:{ COURSE_FILES:"walkthrough-ui-files" } });
  let browser;
  try {
    const json = (path, body, method = "POST") => app.fetch(path, { method, headers:{ ...admin(), Origin:ORIGIN, "Content-Type":"application/json" }, body:JSON.stringify(body) });
    assert.equal((await json("/api/v2/staff/courses", { id:"html-basics", title:"HTML basics", summary:"Short reading lessons about the structure of web pages.", level:"Beginner", priceMinor:0 })).status, 200);
    assert.equal((await json("/api/v2/staff/courses/html-basics/lessons", { title:"Links", kind:"text", body:"A link takes someone to another page, and its words should say where it goes." })).status, 200);

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
    await page.getByRole("button", { name:"Course studio" }).click();
    await page.getByRole("button", { name:"Continue editing" }).click();
    await page.getByRole("button", { name:"Edit Links" }).click();
    await page.getByText("Code walkthrough (optional)").click();
    await page.getByLabel("Example code").fill('<p>\n  <a href="https://example.com/guide">Read the guide</a>\n</p>');
    await page.getByText("3 lines. Up to 40 lines").waitFor();
    await page.getByRole("button", { name:"Add step" }).click();
    await page.getByLabel("From line").fill("9");
    await page.getByLabel("To line").fill("9");
    await page.getByLabel("Step title").fill("A descriptive link");
    await page.getByLabel("Step explanation").fill("The words say where the link goes.");
    await page.getByRole("button", { name:"Save lesson" }).click();
    await page.getByText("Step 1 must point at lines between 1 and 3.").waitFor();
    await page.getByLabel("From line").fill("2");
    await page.getByLabel("To line").fill("2");
    await page.getByRole("button", { name:"Save lesson" }).click();
    await page.getByText("Lesson saved.").waitFor();
    const course = await (await app.fetch("/api/v2/staff/courses/html-basics", { headers:admin() })).json();
    assert.deepEqual(course.course.lessons[0].walkthrough.steps, [{ from:2, to:2, title:"A descriptive link", text:"The words say where the link goes." }]);
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    await app.close();
  }
});
