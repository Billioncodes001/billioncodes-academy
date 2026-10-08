# Course Studio operator guide

## Start in a few minutes

1. Open `https://learnatbillioncodes.com/admin`. The original owner uses **Continue with Google** with their verified Academy owner email, or an email/password account for that address. Other staff use the address the owner added in **Team**. The old private token is not needed for first-owner access. Sign-in is held in page memory only; the console locks after 15 minutes without interaction.
2. Choose **Course studio → Create a new course**. Pick a suggested outline (video, reading, workshop) or a blank course. Enter the title, description, level and a lowercase course address. Set the price to **₦0** for a course learners can join now; paid checkout is not configured.
3. Add written lessons, PDF handouts (up to 20 MiB each), or MP4/WebM video (up to 1 GiB each). Only upload original material or material you have verified permission to redistribute. Video uploads are resumable: if interrupted, reopen the draft's file list and select the *same* file. The page shows progress and stored-file status. PDFs and videos are private R2 objects, not public bucket URLs.
4. Arrange lessons with **Up/Down**, edit lesson text and titles, preview uploaded videos, and check the course outline. Publish when ready. Published courses are listed publicly. Free learners sign in, enrol, resume, and mark lessons complete across devices.

Draft courses may be edited or their unused files removed. A published course can return to draft only before anyone enrols. Once learners enrol, the course is deliberately locked to protect their progress. A replacement/versioning flow for live courses, public instructor profiles, graded quizzes, certificates, paid checkout and automated email are **not** available yet.

## Storage and video behavior

The default file ledger limit is 2 GB across Academy courses. An operator can set `COURSE_STORAGE_LIMIT_GB` to an integer 1–9; this is an application limit, **not** an account-wide billing cap. R2's free allowance is shared with other projects. Video is uploaded in 8 MiB multipart chunks and served as byte ranges through a short-lived signed, same-origin URL. The player has native controls; this is access control, not DRM or transcoding. For reliable mobile playback, upload web-optimized H.264/AAC MP4 and include captions in the original file or accompanying lesson notes. The site does not yet process codecs, create captions, or verify video accessibility for you. Existing Cloudflare Stream registration remains supported for operators who separately configure Stream.

File-rights confirmation in the form is an assertion; the editor remains responsible for checking the source and licence.

## Team access (individual staff sign-in)

Roles: **Owner** — every area, including Team; **Editor** — Course studio only; **Reviewer** — Enquiries inbox and the training-application API, no course editing. The server checks the role on every request; the console only hides tabs a role cannot use.

First-time owner setup (once):
1. Sign in to `/admin` with the verified `jhardeyemor@gmail.com` Google account. This account receives the initial Owner grant on its first successful sign-in; the grant is then bound to its Firebase identity. The `ACADEMY_OWNER_EMAIL` Worker setting must match the address.
2. Open **Team** to add other staff. Keep the old token only as break-glass access if it is still known; it is not required for normal sign-in. If you use an Academy email/password account instead, choose a unique password; **Reset my email password** sends a reset link for an existing password account.

The requested six-digit `654321` is not installed as an admin password. A public six-digit password would be guessable, especially once documented; verified individual identity is the access method.

Adding someone: in **Team**, enter the email address they will sign in with, choose a role, select **Give access**, and privately send them `https://learnatbillioncodes.com/admin`. They choose **Continue with Google**, or sign in with a verified email and password (they can create one on the Academy account page and verify it from their inbox). Nobody can add themselves: a sign-in without an owner's grant is refused.

- The first successful staff sign-in links the grant to that Firebase account. If the address is later used by a different account, it is refused until an owner grants access again.
- **Save role** changes a role; **Remove access** takes effect on that person's next action. **Give access again** restores a removed person and links the next verified sign-in.
- Owners cannot change or remove their own access from their own sign-in, so the team cannot be accidentally locked out. The shared token always remains an Owner.
- **Recent access changes** lists the last 50 grants, role changes and removals with who made them. Enquiry status changes made by staff accounts are recorded as `staff:<email>`; token changes as `admin`.

The access token is a shared secret. Do not give it to instructors or put it in links, documents or source control. Rotate `ADMIN_TOKEN` through Cloudflare if it may have been exposed; staff sign-ins are unaffected by a rotation.

Not yet included: per-person attribution inside Course studio audit records, multi-factor requirements beyond what Google/Firebase enforces, email invitations (send the link yourself), and a training-application review screen (the reviewer role covers the existing API).

## Weekly tutorial queue

The OpenClaw weekly Academy automation is scheduled for **Monday 09:00 Africa/Lagos**, starting 12 October 2026. Its plan and original drafts are in `/home/openclaw/.openclaw/workspace/jobs/academy-weekly/`. It researches one next topic, checks primary sources and code samples, saves an **unpublished** editorial draft, and reports the outcome to the owner. It must not copy third-party PDF text, automatically publish, push code, spend money, or claim a course is live before checking the production catalogue. A PDF found online is only a lead until the exact asset's redistribution licence, author, edition and attribution are verified. The initial CSS foundations draft is already in that queue. This weekly job does **not** guarantee a new public course each week; an editor must review and publish the material.

## Release checks

`npm run build`, `npm run test:backend`, `node --test worker/tests/admin-ui.test.mjs worker/tests/studio-ui.test.mjs worker/tests/staff-ui.test.mjs`, and `npm run test:frontend` are the release checks. Additive D1 migration `0004_staff_access.sql` is the canonical staff schema. The Worker can create those fixed tables itself on first health/staff request if a Git-connected deployment has not applied the migration; the migration remains safe to apply later. `0003_course_studio.sql` must already be present before deployment. After deploying, check that **Continue with Google** opens and completes on the live console; automated tests mock Google's sign-in endpoints and cannot exercise the real pop-up. Inspect the admin page on desktop and phone, test a real staff draft/upload/preview and a learner enrol/playback journey, and check the production catalogue before announcing a course. The automated browser test uses a local D1/R2 harness; it does not exercise the production operator token or a real owner video.

## Code walkthroughs

A reading lesson can carry an optional **code walkthrough**: example HTML (up to 40 lines and 2,000 characters) plus 1-8 steps. Each step points at a line range and has a short title and a plain-language explanation. Learners step through it. Each step highlights its lines and outlines the part of a live preview those lines produce. The preview is matched automatically from the source positions, so authors only enter line numbers.

- **Authoring:** in the console, open a draft course, choose **Edit** on a reading lesson, then open **Code walkthrough (optional)**. Clear the example code (or press **Remove walkthrough**) to delete it.
- **Validation:** `validateWalkthrough` in `packages/learning` is used by both the Worker and the browser. A bad step gets a specific message, for example "Step 1 must point at lines between 1 and 3."
- **Storage:** `learning_lesson_walkthroughs` (migration `0006`), one row per lesson, deleted with the lesson. Only enrolled learners receive walkthroughs, like lesson text.
- **Safety:** the example is shown as text and rendered as React elements from an inert parsed tree. Scripts, event handlers and URLs are dropped, and no HTML is injected.

