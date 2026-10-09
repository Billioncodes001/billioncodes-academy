import test from "node:test";
import assert from "node:assert/strict";
import { ORIGIN, admin, post } from "./harness.mjs";
import { setup } from "./platform-harness.mjs";

const page = async (h, path) => { const response = await h.fetch(path, { headers: { Accept: "text/html" } }); return { status: response.status, html: await response.text(), type: response.headers.get("content-type") }; };
const ld = html => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(match => JSON.parse(match[1]));

test("every page address gets its own search details, structured data and crawlable text", async t => {
  const h = await setup(t);
  const home = await page(h, "/");
  assert.equal(home.status, 200); assert.match(home.type, /text\/html/);
  assert.match(home.html, /<title>Billion Codes \| Learn to code\. Build real projects\.<\/title>/);
  assert.match(home.html, /<link rel="canonical" href="https:\/\/learnatbillioncodes\.com\/" \/>/);
  assert.deepEqual(ld(home.html).map(item => item["@type"]), ["EducationalOrganization", "WebSite"]);

  const lesson = await page(h, "/learn/first-web-page");
  assert.equal(lesson.status, 200);
  assert.match(lesson.html, /<title>Your first web page \| Free introduction \| Billion Codes<\/title>/);
  const course = ld(lesson.html)[0];
  assert.equal(course["@type"], "Course"); assert.equal(course.isAccessibleForFree, true); assert.equal(course.offers.price, 0);
  assert.match(lesson.html, /<noscript><main><h1>Your first web page<\/h1>/);
  assert.match(lesson.html, /A web page begins with meaning\./, "free lesson text is crawlable");
  assert.match(lesson.html, /&lt;h1&gt;My first project&lt;\/h1&gt;/, "lesson text is escaped");

  const build = await page(h, "/practice/profile-card/");
  assert.equal(ld(build.html)[0]["@type"], "LearningResource");
  assert.match(build.html, /canonical" href="https:\/\/learnatbillioncodes\.com\/practice\/profile-card"/, "trailing slash shares the canonical address");

  for (const path of ["/account", "/library", "/training-dashboard", "/apply/some-cohort"]) assert.match((await page(h, path)).html, /<meta name="robots" content="noindex, nofollow" \/>/, path);
  for (const path of ["/learn/not-a-course", "/practice/nope", "/totally/unknown"]) {
    const missing = await page(h, path);
    assert.equal(missing.status, 404, path); assert.match(missing.html, /noindex/);
  }
  assert.equal((await h.fetch("/api/health")).headers.get("content-type").includes("json"), true, "API untouched");
});

test("Course Studio courses appear by title and summary only; their lesson text stays private", async t => {
  const h = await setup(t);
  const staff = (path, data, method = "POST") => h.fetch(path, { ...post(data, undefined, admin()), method });
  const secret = "This paragraph is only for enrolled learners and must never reach search engines.";
  assert.equal((await staff("/api/v2/staff/courses", { id: "css-basics", title: "CSS basics", summary: "Make pages look the way you intend, one small rule at a time.", level: "Beginner", priceMinor: 0 })).status, 200);
  assert.equal((await staff("/api/v2/staff/courses/css-basics/lessons", { title: "Selectors", kind: "text", body: secret })).status, 200);
  assert.equal((await h.fetch(`/course/css-basics`, { headers: { Accept: "text/html" } })).status, 404, "drafts are not public");
  assert.equal((await staff("/api/v2/staff/courses/css-basics/publish", { version: 1 })).status, 200);
  const course = await page(h, "/course/css-basics");
  assert.equal(course.status, 200);
  assert.match(course.html, /<title>CSS basics \| Billion Codes<\/title>/);
  assert.ok(!course.html.includes(secret));
  const listing = await page(h, "/courses");
  assert.ok(ld(listing.html)[0].itemListElement.some(item => item.url === "https://learnatbillioncodes.com/course/css-basics"));

  const map = await h.fetch("/sitemap.xml");
  assert.match(map.headers.get("content-type"), /xml/);
  const xml = await map.text();
  for (const path of ["/", "/learn/first-web-page", "/practice/profile-card", "/course/css-basics"]) assert.ok(xml.includes(`<loc>https://learnatbillioncodes.com${path}</loc>`), path);
  assert.ok(!xml.includes("/account") && !xml.includes("/admin"));
  const llms = await (await h.fetch("/llms.txt")).text();
  assert.match(llms, /^# Billion Codes/);
  assert.match(llms, /\[CSS basics\]\(https:\/\/learnatbillioncodes\.com\/course\/css-basics\)/);
  assert.ok(!llms.includes(secret));
});
