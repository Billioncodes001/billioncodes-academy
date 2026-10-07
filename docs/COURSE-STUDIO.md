# Course Studio operator guide

## Start in a few minutes

1. Open `https://learnatbillioncodes.com/admin` and unlock with the existing private operator access token. It is held in page memory only; the console locks after 15 minutes without interaction. There is no self-service credential-connection form or individual staff account yet.
2. Choose **Course studio → Create a new course**. Pick a suggested outline (video, reading, workshop) or a blank course. Enter the title, description, level and a lowercase course address. Set the price to **₦0** for a course learners can join now; paid checkout is not configured.
3. Add written lessons, PDF handouts (up to 20 MiB each), or MP4/WebM video (up to 1 GiB each). Only upload original material or material you have verified permission to redistribute. Video uploads are resumable: if interrupted, reopen the draft's file list and select the *same* file. The page shows progress and stored-file status. PDFs and videos are private R2 objects, not public bucket URLs.
4. Arrange lessons with **Up/Down**, edit lesson text and titles, preview uploaded videos, and check the course outline. Publish when ready. Published courses are listed publicly. Free learners sign in, enrol, resume, and mark lessons complete across devices.

Draft courses may be edited or their unused files removed. A published course can return to draft only before anyone enrols. Once learners enrol, the course is deliberately locked to protect their progress. A replacement/versioning flow for live courses, instructor accounts, graded quizzes, certificates, paid checkout and automated email are **not** available yet.

## Storage and video behavior

The default file ledger limit is 2 GB across Academy courses. An operator can set `COURSE_STORAGE_LIMIT_GB` to an integer 1–9; this is an application limit, **not** an account-wide billing cap. R2's free allowance is shared with other projects. Video is uploaded in 8 MiB multipart chunks and served as byte ranges through a short-lived signed, same-origin URL. The player has native controls; this is access control, not DRM or transcoding. For reliable mobile playback, upload web-optimized H.264/AAC MP4 and include captions in the original file or accompanying lesson notes. The site does not yet process codecs, create captions, or verify video accessibility for you. Existing Cloudflare Stream registration remains supported for operators who separately configure Stream.

The operator token is a shared secret, not an individual role. Do not distribute it to instructors or put it in links, documents or source control. The next security milestone is individual staff sign-in with roles and revocation. File-rights confirmation in the form is an assertion; the editor remains responsible for checking the source and licence.

## Weekly tutorial queue

The OpenClaw weekly Academy automation is scheduled for **Monday 09:00 Africa/Lagos**, starting 12 October 2026. Its plan and original drafts are in `/home/openclaw/.openclaw/workspace/jobs/academy-weekly/`. It researches one next topic, checks primary sources and code samples, saves an **unpublished** editorial draft, and reports the outcome to the owner. It must not copy third-party PDF text, automatically publish, push code, spend money, or claim a course is live before checking the production catalogue. A PDF found online is only a lead until the exact asset's redistribution licence, author, edition and attribution are verified. The initial CSS foundations draft is already in that queue. This weekly job does **not** guarantee a new public course each week; an editor must review and publish the material.

## Release checks

`npm run build`, `npm run test:backend`, `node --test worker/tests/admin-ui.test.mjs worker/tests/studio-ui.test.mjs`, and `npm run test:frontend` are the release checks. Apply additive D1 migration `0003_course_studio.sql` before deploying the Worker. Inspect the admin page on desktop and phone, test a real staff draft/upload/preview and a learner enrol/playback journey, and check the production catalogue before announcing a course. The automated browser test uses a local D1/R2 harness; it does not exercise the production operator token or a real owner video.
