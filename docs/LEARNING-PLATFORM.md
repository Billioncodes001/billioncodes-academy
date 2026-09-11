# Learning platform foundation

## Journeys

One Firebase Google identity, two separate spaces:

- `/#/library`: published free-course enrolments and account-backed lesson marks.
- `/#/training-dashboard`: intake applications, draft/submitted/review/offer states.
- `/#/resources`: externally hosted educational resources with creator and licence credits.

Q1 and Q4 are the owner's proposed two annual windows, not a claimed competitor schedule. No real cohort, fee, start date, credential or placement guarantee is seeded. A cohort must have opening/closing/start dates and a tuition note before it can accept applications. An offer never creates a course purchase or confirms a training place.

### Research informing the implementation

[AltSchool's application guide](https://altschool.crisp.help/en/article/how-to-apply-to-altschool-africas-program-shr5ho/) separates account creation and programme application. Its [engineering FAQ](https://altschoolafrica.com/faqs/school-of-engineering) describes preparation and assessment. This release borrows the separate admissions journey, not its prices, qualifications or claims.

[Udemy's learner FAQ](https://support.udemy.com/hc/en-us/articles/229232187-Learning-with-Udemy-Frequently-asked-questions) distinguishes discovering a course from accessing enrolled learning. Its [curriculum guide](https://support.udemy.com/hc/en-us/articles/229606188-Understanding-Curriculum-Items-for-Your-Course) describes multiple lesson formats. Academy now models text, PDF and protected video lessons, with its own UI and content.

## Firebase setup

Project: `billion-codes-academy`. Web application: Billion Codes Web.

Google provider enabled; public name Billion Codes Academy; existing owner support email. Spark/no-cost plan; Analytics and optional Gemini were not selected during creation. No Firebase Storage, Firestore, paid phone authentication, service-account private keys or billing upgrade is needed for this implementation.

Authorized production domains: `learnatbillioncodes.com`, `www.learnatbillioncodes.com`. Default Firebase handler domains and `localhost` are also present. The Firebase web API key in Wrangler is public client configuration, not an administrator credential. Restrict any future extra API keys to required APIs; never reuse this key for unrelated billable Google services.

[Google sign-in setup](https://firebase.google.com/docs/auth/web/google-signin) and [server ID-token verification](https://firebase.google.com/docs/auth/admin/verify-id-tokens) are the source contracts. The Worker uses `jose` to check RS256 signature, issuer, audience, expiry, issue/authentication times and verified Google provider. A fixed Firebase `accounts:lookup` request additionally checks the current account and revocation time. No token, refresh token, password or profile image is written to D1.

The frontend keeps Firebase authentication in memory. Reloading or closing the page ends local sign-in. Account-backed learning persists in D1. Device-only practice drafts remain separate and are never imported without consent. API responses and protected file downloads use `no-store`; public service-worker caches exclude APIs.

An Academy profile is created only after the privacy checkbox and confirmed name. UID, not email supplied by a browser, owns enrolments/applications. No learner can assign themselves staff rights. Staff endpoints retain the existing secret `ADMIN_TOKEN` gate. Firebase disable/delete/revoke and Academy's `learner_users.disabled` block protected access. Account deletion/export currently requires operator assistance, including removal from Firebase and D1; R2 content is shared course material, not user-owned data.

## Storage and costs

Private R2 Standard bucket: `billioncodes-academy-courses`, binding `COURSE_FILES`. Created through the existing dashboard session without expanding Wrangler's OAuth permissions. Public access stays disabled; do not attach an `r2.dev` URL or public custom domain to protected material.

[R2 pricing](https://developers.cloudflare.com/r2/pricing/) includes 10 GB-month, 1 million Class A and 10 million Class B operations monthly on Standard storage. Above the allowance, storage is $0.015/GB-month, with separate operation charges; internet egress is free. Allowances are account-wide, not reserved for this project. The application independently caps PDF uploads at 20 MiB each, 20 per day, and 2 GB total ledger-reserved storage. These guards are not an account-wide billing cap. Other apps and dashboard uploads are outside them.

Cloudflare Stream is **not activated or purchased by this release**. [Stream pricing](https://developers.cloudflare.com/stream/pricing/) is $5 per 1,000 stored minutes (capacity increments), plus $1 per 1,000 delivered minutes. Use official external course links first. To publish owned/licensed recordings later, configure the narrowly scoped `STREAM_API_TOKEN` secret and `STREAM_ACCOUNT_ID`, upload through the Stream dashboard, require signed URLs, then register the processed video UID in the publishing API. Token issuance checks course ownership and expires after five minutes. This is access control, not a guarantee against recording/copying.

No new email administration permission was needed after choosing Firebase Google authentication.

## Publishing API

All writes use an allowed Origin. Staff routes additionally require `Authorization: Bearer <ADMIN_TOKEN>`. Never paste that value into chat, source control, URLs or public dashboards. The existing admin page still manages legacy launch enquiries; the new publishing and cohort operations are API-only in this foundation.

- `GET/POST /api/v2/staff/courses`: list courses or create a draft (`id`, `title`, `summary`, `level`, integer `priceMinor` in kobo).
- `GET /api/v2/staff/courses/:id`: inspect lessons/resources and version.
- `POST .../:id/pdf`: raw application/pdf with `X-File-Name` and `X-Content-Rights: confirmed`. Operator must record and verify the source licence before uploading. PDF header/trailer checks are not malware scanning; accept only reviewed staff material.
- `POST .../:id/video`: `{uid,title,rightsConfirmed:true}` for an already processed, signed-only Stream video.
- `POST .../:id/lessons`: `{title,kind,body?,resourceId?}`. Text body is plain text; file resources must belong to the draft course.
- `POST .../:id/publish`: `{version}`. Requires at least one complete lesson. Published courses are immutable through this release's API; draft editing/removal and archive controls remain future work.
- `GET/POST /api/v2/staff/cohorts`: planned/open/closed intake with explicit dates, format and tuition note. Optimistic `version` prevents overwriting newer changes.
- `GET /api/v2/staff/applications`: submitted/non-draft applications only, bounded to 100 latest records. Pagination remains future work.
- `PATCH /api/v2/staff/applications/:id`: `{status,version}`, status under-review/offered/declined. Review is not an enrolment.

Staff audit entries are recorded after writes; they are operational history, not a transactional compliance audit. Enquiry audit triggers from the earlier launch remain unchanged. Failed/unfinished R2 uploads keep their storage reservation until an operator reconciles the D1 resource and object. No automatic destructive cleanup is enabled.

## Release and verification

Migration `0002_learning_platform.sql` is additive and preserves all legacy submissions. `LEARNING_PLATFORM=enabled` exposes the new journeys and blocks anonymous POSTs to the old training endpoint. Set it to `disabled` and redeploy for an application-layer rollback; do not drop new tables or delete learner data to roll back a release.

Cloudflare Builds on main runs the existing build, backend tests, remote migration and deployment. Feature branches do not deploy. GitHub CI also runs browser and mobile checks. Backend tests mock only Google's outbound endpoints using generated RSA signatures; separate UI tests explicitly mock the Google popup adapter. Neither mechanism is enabled by any production configuration or hidden test header. A real browser sign-in check is still required when changing Firebase domains, CSP or providers.

Not implemented: checkout/payment webhooks, paid entitlements, course certificates, automatic content imports, staff publishing UI, native mobile Firebase sign-in, training attendance/timetables or scheduled application emails. Do not describe those as live.
