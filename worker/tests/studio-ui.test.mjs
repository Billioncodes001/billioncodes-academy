import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { createHarness, ADMIN, ORIGIN } from "./harness.mjs";

const PART = 8 * 1024 * 1024;
function fakeMp4(size) {
  const bytes = Buffer.alloc(size);
  bytes.writeUInt32BE(32, 0); bytes.write("ftypisom", 4, "latin1");
  return bytes;
}

test("course studio: template, chunked video upload, reading lesson, reorder, preview and publish in a real browser", async () => {
  const app = await createHarness({ LEARNING_PLATFORM:"enabled" }, { r2Buckets:{ COURSE_FILES:"studio-ui-files" } });
  let browser;
  try {
    browser = await chromium.launch({ headless:true, executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined });
    const context = await browser.newContext();
    const partRequests = [];
    // Intercept every request: the browser never contacts the real public domain.
    await context.route("**/*", async route => {
      const request = route.request();
      if (!request.url().startsWith(ORIGIN + "/")) return route.abort();
      if (/\/parts\/\d+$/.test(request.url())) partRequests.push(request.url());
      const response = await app.fetch(request.url().slice(ORIGIN.length), { method:request.method(), headers:await request.allHeaders(), ...(request.postDataBuffer() ? { body:request.postDataBuffer() } : {}) });
      await route.fulfill({ status:response.status, headers:Object.fromEntries(response.headers), body:Buffer.from(await response.arrayBuffer()) });
    });
    const page = await context.newPage();
    await page.setViewportSize({ width:1440, height:900 });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error" && !/Failed to load resource/.test(message.text())) errors.push(message.text()); });
    page.on("dialog", dialog => dialog.accept());
    await page.goto(ORIGIN + "/admin");
    await page.locator("#token").fill(ADMIN);
    await page.locator("#unlock").click();
    await page.getByRole("button", { name:"Course studio" }).click();
    await page.getByRole("button", { name:"Create a new course" }).click();
    await page.getByLabel("Video course").check();
    await page.locator("#course-title").fill("Python for complete beginners");
    assert.equal(await page.locator("#course-slug").inputValue(), "python-for-complete-beginners");
    await page.locator("#course-summary").fill("Write your first useful Python programs, one short video at a time.");
    await page.getByRole("button", { name:"Create draft course" }).click();
    await page.getByText("Suggested lesson plan").waitFor();

    // Template suggestion pre-fills a video lesson; the file uploads in 8 MiB parts.
    await page.locator(".suggestion", { hasText:"Welcome: what you will build" }).getByRole("button", { name:"Use this" }).click();
    assert.equal(await page.locator("#lesson-title").inputValue(), "Welcome: what you will build");
    assert.equal(await page.locator("#lesson-section").inputValue(), "Getting started");
    const video = fakeMp4(PART + 4096);
    await page.locator("#lesson-file").setInputFiles({ name:"Welcome (take 2).mp4", mimeType:"video/mp4", buffer:video });
    await page.locator("#lesson-rights").check();
    await page.getByRole("button", { name:"Upload and add lesson" }).click();
    await page.getByText('Lesson "Welcome: what you will build" added.').waitFor({ timeout:30000 });
    assert.equal(partRequests.length, 2);

    const hostile = '<img src=x onerror="window.xssFired=true"> Practice';
    await page.locator(".suggestion", { hasText:"Practice exercise" }).getByRole("button", { name:"Use this" }).click();
    assert.ok((await page.locator("#lesson-body").inputValue()).length >= 40, "reading scaffold pre-filled");
    await page.locator("#lesson-title").fill(hostile);
    await page.getByRole("button", { name:"Add lesson", exact:true }).click();
    await page.getByText(`Lesson "${hostile}" added.`).waitFor();
    assert.equal(await page.locator("#studio-root img").count(), 0);
    assert.equal(await page.evaluate(() => window.xssFired), undefined);

    await page.getByRole("button", { name:`Move ${hostile} up` }).click();
    await page.getByText("Lesson moved.").waitFor();
    assert.match(await page.locator(".lesson").first().innerText(), /Practice/);

    await page.getByRole("button", { name:"Preview" }).click();
    const src = await page.locator("#studio-root video").getAttribute("src");
    assert.match(src, /^\/api\/v2\/media\/[a-z0-9-]+\/s\/\d{10}\/[a-f0-9]{64}$/);
    assert.equal(await page.evaluate(async url => (await fetch(url, { headers:{ Range:"bytes=0-15" } })).status, src), 206);

    const shots = process.env.STUDIO_SCREENSHOTS; // Optional local review artefacts, e.g. reviews/studio.
    if (shots) await page.screenshot({ path:`${shots}/studio-1440.png`, fullPage:true });
    await page.setViewportSize({ width:375, height:812 });
    if (shots) await page.screenshot({ path:`${shots}/studio-375.png`, fullPage:true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.getByRole("button", { name:"Publish course" }).click();
    await page.getByText("Published. Learners can now find this course.").waitFor();
    const course = await (await app.fetch("/api/v2/courses/python-for-complete-beginners")).json();
    assert.equal(course.course.status, "published");
    assert.deepEqual(course.course.lessons.map(item => [item.kind, item.section]), [["text", "Core lessons"], ["video", "Getting started"]]);

    await page.locator("#lock").click();
    assert.equal(await page.locator("#studio-root").innerText(), "");
    assert.equal(await page.locator("#studio-panel").isVisible(), false);
    assert.deepEqual(await page.evaluate(() => [localStorage.length, sessionStorage.length]), [0, 0]);
    assert.deepEqual(errors, []);
    await context.close();
  } finally {
    if (browser) await browser.close();
    await app.close();
  }
});
