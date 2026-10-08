import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { decodeJwt } from "jose";
import { ORIGIN, admin, post } from "./harness.mjs";
import { setup } from "./platform-harness.mjs";

// Real browser + real Firebase Auth SDK bundle. Only Google's REST endpoints are replaced by
// local fakes that return locally signed ID tokens; nothing leaves the machine.
test("owner adds an editor in Team; the editor signs in with a verified email and sees only the studio; revocation locks the console", async t => {
  const h = await setup(t, { ACADEMY_OWNER_EMAIL:'owner@example.com' });
  const accounts = new Map([["owner@example.com", "owner"], ["ed@example.com", "ed"], ["mallory@example.com", "mallory"]]);
  let browser;
  try {
    browser = await chromium.launch({ headless:true, executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined });
    const context = await browser.newContext();
    const external = [];
    await context.route("**/*", async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.hostname === "identitytoolkit.googleapis.com") {
        const cors = { "access-control-allow-origin":ORIGIN, "access-control-allow-headers":"*", "access-control-allow-methods":"POST, OPTIONS", "content-type":"application/json" };
        if (request.method() === "OPTIONS") return route.fulfill({ status:204, headers:cors });
        const body = request.postDataJSON();
        if (url.pathname.endsWith("accounts:signInWithPassword")) {
          const uid = accounts.get(body.email);
          if (!uid || body.password !== "correct horse battery") return route.fulfill({ status:400, headers:cors, body:JSON.stringify({ error:{ code:400, message:"INVALID_LOGIN_CREDENTIALS" } }) });
          const idToken = await h.token(uid, { email:body.email, firebase:{ sign_in_provider:"password" } });
          return route.fulfill({ headers:cors, body:JSON.stringify({ kind:"identitytoolkit#VerifyPasswordResponse", localId:uid, email:body.email, displayName:"", idToken, registered:true, refreshToken:"local-refresh-token", expiresIn:"3600" }) });
        }
        if (url.pathname.endsWith("accounts:lookup")) {
          const claims = decodeJwt(body.idToken);
          return route.fulfill({ headers:cors, body:JSON.stringify({ users:[{ localId:claims.sub, email:claims.email, emailVerified:true, providerUserInfo:[{ providerId:"password", email:claims.email, rawId:claims.email }], lastLoginAt:String(Date.now()), createdAt:String(Date.now()) }] }) });
        }
      }
      if (!request.url().startsWith(ORIGIN + "/")) { external.push(request.url()); return route.abort(); }
      const response = await h.fetch(request.url().slice(ORIGIN.length), { method:request.method(), headers:await request.allHeaders(), ...(request.postDataBuffer() ? { body:request.postDataBuffer() } : {}) });
      await route.fulfill({ status:response.status, headers:Object.fromEntries(response.headers), body:Buffer.from(await response.arrayBuffer()) });
    });
    const page = await context.newPage();
    await page.setViewportSize({ width:1440, height:900 });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error" && !/Failed to load resource/.test(message.text())) errors.push(message.text()); });
    page.on("dialog", dialog => dialog.accept());
    await page.goto(ORIGIN + "/admin");

    // Owner bootstrap: verified account, no old access token, then grant an editor.
    await page.locator("#staff-email").fill("owner@example.com");
    await page.locator("#staff-password").fill("correct horse battery");
    await page.getByRole("button", { name:"Sign in with email" }).click();
    await page.getByText("Owner | owner@example.com").waitFor();
    await page.getByRole("button", { name:"Team" }).click();
    await page.getByText("owner@example.com").first().waitFor();
    await page.locator("#member-email").fill("ed@example.com");
    await page.locator("#member-name").fill('<img src=x onerror="window.xssFired=true"> Ed');
    await page.locator("#member-role").selectOption("editor");
    await page.getByRole("button", { name:"Give access" }).click();
    await page.getByText(/Access given to ed@example.com as Editor/).waitFor();
    assert.match(await page.locator("#team-root").innerText(), /Has not signed in yet/);
    assert.equal(await page.locator("#team-root img").count(), 0);
    const shots = process.env.STAFF_SCREENSHOTS; // Optional local review artefacts.
    if (shots) await page.screenshot({ path:`${shots}/team-1440.png`, fullPage:true });
    await page.setViewportSize({ width:375, height:812 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    if (shots) await page.screenshot({ path:`${shots}/team-375.png`, fullPage:true });
    await page.locator("#lock").click();
    assert.equal(await page.locator("#team-root").innerText(), "");
    if (shots) await page.screenshot({ path:`${shots}/signin-375.png`, fullPage:true });
    await page.setViewportSize({ width:1440, height:900 });
    if (shots) await page.screenshot({ path:`${shots}/signin-1440.png`, fullPage:true });

    // A signed-in stranger is told they have no staff access; nothing is created for them.
    await page.locator("#staff-email").fill("mallory@example.com");
    await page.locator("#staff-password").fill("correct horse battery");
    await page.getByRole("button", { name:"Sign in with email" }).click();
    await page.getByText("This account does not have staff access. Ask the Academy owner to grant it.").waitFor();
    assert.equal(await page.locator("#tabs").isVisible(), false);
    assert.equal(await page.locator("#staff-password").inputValue(), "");

    // The editor signs in, sees only the studio, and can create a draft.
    await page.locator("#staff-email").fill("ed@example.com");
    await page.locator("#staff-password").fill("correct horse battery");
    await page.getByRole("button", { name:"Sign in with email" }).click();
    await page.getByText("Editor | ed@example.com").waitFor();
    await page.getByRole("heading", { name:"Your courses" }).waitFor();
    assert.equal(await page.getByRole("button", { name:"Enquiries" }).isVisible(), false);
    assert.equal(await page.getByRole("button", { name:"Team" }).isVisible(), false);
    assert.equal(await page.getByRole("button", { name:"Course studio" }).getAttribute("aria-pressed"), "true");
    await page.getByRole("button", { name:"Create a new course" }).click();
    await page.locator("#course-title").fill("Editor account course");
    await page.locator("#course-summary").fill("Created by an individual editor account rather than the shared token.");
    await page.getByRole("button", { name:"Create draft course" }).click();
    await page.getByText("Draft created. Next, add your lessons.").waitFor();
    assert.deepEqual(await page.evaluate(() => [localStorage.length, sessionStorage.length]), [0, 0]);

    // The owner revokes access elsewhere; the editor's next action locks the console.
    const { members } = await (await h.fetch("/api/v1/admin/staff", { headers:admin() })).json();
    const revoked = await h.fetch(`/api/v1/admin/staff/${members[0].id}/revoke`, post({ version:members[0].version }, undefined, admin()));
    assert.equal(revoked.status, 200);
    await page.getByRole("button", { name:"Back to all courses" }).click();
    await page.getByText("This account does not have staff access. Ask the Academy owner to grant it.").waitFor();
    assert.equal(await page.locator("#studio-panel").isVisible(), false);
    assert.equal(await page.locator("#studio-root").innerText(), "");

    assert.equal(await page.evaluate(() => window.xssFired), undefined);
    assert.deepEqual(external, []);
    assert.deepEqual(errors, []);
    await context.close();
  } finally {
    if (browser) await browser.close();
  }
});
