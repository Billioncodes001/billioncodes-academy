# Billion Codes Launch Backend

Version: API v1 / contract 1.0.0. Scope: free introductory text lessons, training applications, project enquiries and private operations review. This is not a paid learning platform, booking system, contract-signing service or learner account system. No instructor biography, historic results, prices, video library, payment success, enrolment or referral credit is invented.

## Ownership and launch handoff

- Worker entry: `worker/index.js`, dependency-free ESM bundled by Wrangler 4.131.1.
- Worker: `billioncodes-academy`; account: `40687c1a299192a1ba3add80961e429f`.
- D1 binding: `DB`; database: `billioncodes-academy-db`. Parent operator must replace the all-zero database ID in `wrangler.jsonc` with the actual ID.
- Static build: `dist`, binding `ASSETS`. Run the frontend-owned build before Wrangler. All requests run through the Worker so API paths cannot fall back to SPA HTML and the admin shell gets its security headers.
- Production origins: `https://learnatbillioncodes.com` and `https://www.learnatbillioncodes.com`. Parent owns domain routes, DNS and whether to disable the workers.dev hostname after cutover. No wildcard or production localhost origin is included.
- Required production secret `SECURITY_SALT`: independent cryptographically random value, 32-256 characters. Required private-review secret `ADMIN_TOKEN`: independent 256-bit random printable ASCII value, for example 64 hex characters. Do not reuse either secret.
- Parent owns deployment, secrets, migrations against remote D1, git and package files. Backend work does not commit, push, deploy or create production records.
- No cron, scheduled handler, notification automation or recurring work is configured.

## Exact commands

Run from `/private/tmp/billioncodes-webinar-20260911/academy`. Existing frontend-owned dependencies include Wrangler 4.131.1, Miniflare (transitive) and esbuild (transitive); the backend itself has no runtime npm dependencies.

```sh
node --test worker/tests/backend.test.mjs
node worker/tests/miniflare-smoke.mjs
```

The separate real-browser admin check can use an existing Chrome installation rather than downloading browsers:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' node --test worker/tests/admin-ui.test.mjs
```

Omit the environment override when Playwright's matching Chromium is already installed. The browser test intercepts every request into local Miniflare; it never contacts the production domain. It covers authentication, hostile HTML rendered as text, a real D1 status/audit update, 390-pixel layout, empty browser persistent storage, and clearing records/token on lock and reload.

The suite runs the bundled Worker under local workerd with real Miniflare D1, applies the actual migration and calls the Worker over HTTP. It needs permission to listen on loopback. It uses fixed test-only secrets and isolated local D1, not the production database. `MINIFLARE_PATH` can point to an already-installed Miniflare module if npm did not hoist it. The test harness supports both the older constructor and the Miniflare 5 compatibility adapter.

Local application run, after the parent has provided local-only secrets through ignored `.dev.vars` or equivalent environment configuration:

```sh
npm run build
npx wrangler d1 migrations apply billioncodes-academy-db --local
npx wrangler dev --port 8788 --var ALLOWED_ORIGINS:http://localhost:5174,http://localhost:8788,http://127.0.0.1:5174,http://127.0.0.1:8788
```

In another terminal `npm run dev` serves the frontend on port 5174; its Vite proxy targets 8788. Alternatively use `http://localhost:8788` to exercise the built assets and API together. Provide `SECURITY_SALT` and `ADMIN_TOKEN` locally without adding them to source control. The integration test does not need a `.dev.vars` file or production credentials.

Parent-only release sequence: set the correct D1 ID, apply the additive remote migration, set both secrets through Cloudflare's secret mechanism, build, deploy and attach the custom domains. The relevant remote command is `npx wrangler d1 migrations apply billioncodes-academy-db --remote`. Do not deploy with the placeholder ID, and do not copy the test secrets into production.

## HTTP contract

The machine-readable source of truth is `api-contract.json`. Public endpoints:

| Method and path | Behaviour |
| --- | --- |
| `GET /api/health` | Checks required D1 tables and the submission security salt. Returns 200 when submissions are ready, otherwise 503. Does not claim admin authentication, email delivery or payment readiness. |
| `GET /api/v1/catalog` | One free beginner course with three complete lessons, `training.status = applications-open`, `payments.enabled = false`. |
| `POST /api/v1/applications` | Durable training enquiry. Returns `201 {accepted:true,id}` only after the D1 transaction. |
| `POST /api/v1/project-requests` | Durable project enquiry with the same confirmation contract. |
| `/api/v1/payments/*`, `/api/v1/checkout`, `/api/v1/enrolments`, `/api/v1/referrals/*` | Explicit 503 unconfigured errors. No financial or access side effects. |

The catalogue is published content and does not require a database read. A 201 submission response means stored for review, not a guaranteed reply, confirmed training place, agreed deadline, quote or contract. No email service is configured and no email is sent. There is no public submission list, lookup by ID, status endpoint or file-upload endpoint. Unknown API paths return JSON 404, never the SPA shell.

### Validation and retry rules

Only `application/json` with optional `charset=utf-8` is accepted. The complete body is limited to 16,384 UTF-8 bytes, including chunked bodies. Malformed UTF-8, unpaired surrogates, unsupported control characters, non-object JSON, wrong types, unknown keys and compressed bodies are rejected. No HTML parsing, execution or rich-text conversion occurs. Names, descriptions and lesson blocks are plain text.

Lengths count Unicode code points after trimming, not UTF-16 code units or bytes. A maximum-character payload must also satisfy the total UTF-8 body cap; multibyte text can reach that cap sooner. Single-line fields reject newlines, tabs and control characters. Experience, goals and details allow newline, tab and carriage return.

| Field | Bound / values |
| --- | --- |
| `name` | 2-100 characters |
| `email` | 3-254 characters, practical ASCII mailbox validation, local part at most 64, dotted domain; domain lowercased, local part preserved |
| `phone` | Optional; blank omitted; 7-30 characters from digits, `+`, parentheses, dot, space and hyphen |
| `track` | 2-80 characters; free text, not an invented roster of available classes |
| `format` | `online`, `physical`, `undecided` |
| `experience` | 2-1,000 characters |
| `goals` | 10-2,000 characters |
| `category` | `business-software`, `mentorship`, `code-review` |
| `summary` | 10-160 characters |
| `details` | 20-5,000 characters |
| `targetDate` | Optional real calendar date, YYYY-MM-DD, years 2026-2100; preference only, past dates not rejected |
| `consent` | Boolean `true`, permission to store the enquiry to review/respond, not marketing consent |
| `website` | Optional honeypot; empty after trimming; maximum 200 nonempty characters before rejection; never stored |

Public writes require a UUID `Idempotency-Key` (versions 1-8, standard variant). The server lowercases UUIDs, validates and canonicalises values in a fixed property order, and compares a SHA-256 digest that includes the endpoint kind. Key order, harmless trimming, domain casing and omitted optional empty strings do not create different submissions. A successful unchanged retry returns the original 201 and ID even after the submission cap has been reached. A changed canonical payload or changed endpoint with the same key returns 409.

Keep the same key while retrying an unchanged payload after network failures. On edits, use a fresh key. Idempotency is guaranteed while the submission row is retained. If the parent later adopts deletion/retention, it must decide whether to retain non-PII idempotency tombstones rather than silently promising indefinite deduplication.

Errors have `{error:string,fields?:object}`. Relevant codes: 400 malformed, 403 origin/CSRF, 405 method, 409 conflict, 413 size, 415 encoding/type, 422 validation, 429 capacity/rate, 503 unavailable/unconfigured. `Retry-After` gives seconds for 429. Do not discard a user's in-memory form data on a recoverable error.

### Origins and authentication

Public POSTs must supply an explicitly allowed `Origin`. `Origin: null`, missing origin, suffix-lookalike domains and cross-site Fetch Metadata are rejected. Preflight allows only declared methods and `Content-Type`, `Idempotency-Key`, `Authorization`. No wildcard CORS and no credentialed cross-origin cookies are enabled. A forged Origin is not authentication: public submissions are intentionally anonymous and abuse-controlled. Non-browser public-write clients must explicitly supply an allowed origin under this v1 contract.

Admin API requests require `Authorization: Bearer ADMIN_TOKEN`. Supplied browser origins are checked; an authenticated operator CLI may omit Origin. Token checking uses native Web Crypto HMAC verification rather than early-return string comparison. Never put credentials in URL query strings, cookies, browser localStorage/sessionStorage, public build variables or logs. URL credential parameters are rejected, but reverse proxies can log URLs before the Worker sees them, so operators must not send such URLs in the first place.

### Private operations

Open `/admin` or `/admin.html` on the deployed site. The HTML shell is public, but contains no private records or secret. Unlocking fetches records from the authenticated API. The token and fetched records stay in page memory; locking, page navigation/reload and 15 minutes without interaction clear them. The console uses textContent/createElement, no innerHTML; no external scripts, analytics or fonts; a per-response nonce CSP; `no-store`, no-index, no-referrer and frame denial. A manual lock is still necessary before handing over a device.

| Endpoint | Details |
| --- | --- |
| `GET /api/v1/admin/submissions` | Query: optional kind/status filters, limit 1-50 (default 20), opaque keyset cursor. Newest first; no unlimited list or export. |
| `PATCH /api/v1/admin/submissions/{id}` | JSON `{status,version}`. Status is `new`, `contacted` or `closed`; stale row versions return 409. |
| `GET /api/v1/admin/submissions/{id}/audit` | Last 100 status changes, newest first. No enquiry body, raw IP or token in audit. |

Each actual status change increments the version and writes an audit row using a SQLite trigger in the same statement/transaction. Concurrent edits cannot silently overwrite one another. Re-saving the current status is a no-op. Shared-token audit actor is `admin`, not an invented individual identity. Rotate the token through Cloudflare if exposed. MFA, individual operator accounts, session revocation and granular roles are not implemented; Cloudflare Access may later provide an additional operator gate, but is not required or configured by this backend.

## Abuse controls and Free-plan limits

- Default 500 accepted submissions per UTC day, combined across both public write routes. A D1 batch transaction atomically gates insert, unique idempotency key and accepted counter; races cannot overshoot the cap.
- Default 6,000 admitted valid-payload requests per UTC day, including retries. Default 30 per HMAC IP identifier per 10-minute fixed window. Blocked IPs do not consume shared daily capacity. Admitted successful replays return the original receipt without consuming another submission slot; throttled requests return 429 with Retry-After. A bounded five-second denial cache reduces repeated database work.
- `CF-Connecting-IP` is supplied by the Cloudflare edge; `X-Forwarded-For` is ignored. No raw IP goes into D1. An HMAC-SHA-256 with `SECURITY_SALT`, day and IP produces the rate identifier. If no IP is present locally, requests share one anonymous bucket. Local IP-injection tests do not mean production callers can choose their trusted edge IP.
- IP buckets expire one hour after the end of the 10-minute window. Daily counters expire after the following UTC day. Expiry is logical; physical removal occurs opportunistically during new submission transactions, at most 1,000 expired rows per transaction. Quiet periods can retain expired buckets until another write or manual cleanup. No cron or automatic background retention task exists.
- Daily setting variables have hard upper bounds; invalid settings fall back to defaults rather than disabling protection. Shared campus/network IPs can hit a limit; the UI should preserve the form and display retry guidance.
- This is not DDoS protection. Invalid requests, catalogue reads, health checks and rejected admin attempts do not have an application-wide edge request cap. Monitor Cloudflare usage and errors. The owner selected Workers Paid ($5/month plus usage); a 50 ms Worker CPU cap is configured. Application counters do not cap all Worker invocations or Cloudflare billing.
- All request input and returned lists are bounded. Hashing is small and uses native Web Crypto. D1 waits do not require busy loops. Local integration timings are wall-clock timings, not Cloudflare CPU measurements; the Free plan's per-request CPU limit still requires a deployed smoke check. Worker-first static routing trades extra invocations for consistent API/admin handling; it is not a guarantee that every traffic pattern fits Free quotas.

## Privacy, retention and recovery

Stored data: validated enquiry, consent version and UTC consent timestamp, created/updated timestamps, status/version, UUID idempotency key, payload digest and status-only audit. No uploads, payment details, learner password, browser fingerprint, raw IP or marketing subscription is stored. Do not put secrets, passwords or sensitive third-party records in enquiries.

Submission rows have **no automatic deletion policy** in this release. `closed` is a workflow label, not deletion. The public notice must describe the actual purpose and manual handling, not promise a fixed deletion period or automatic erasure. Before promising a duration, the owner must choose and operate it. Review closed enquiries and removal requests manually; do not retain records merely because the software has no timer. No legal certification or jurisdiction-specific compliance claim is made.

Only an authorised operator should perform retention maintenance through D1 tooling after checking the record, any operational need and the chosen retention policy. Preview candidate IDs/counts first, export only if there is an approved backup need, then remove narrowly scoped rows. A foreign key cascades submission deletion to its audit; this also removes the idempotency key, so account for replay semantics. Do not run broad deletion as a launch smoke test. No HTTP delete endpoint is exposed in the launch console.

To clean only expired abuse buckets manually, the parent can execute the following bounded statement through approved D1 tooling, repeating manually if needed. It does not remove enquiries:

```sql
DELETE FROM rate_buckets
WHERE bucket_key IN (
  SELECT bucket_key FROM rate_buckets
  WHERE expires_at < unixepoch()
  ORDER BY expires_at
  LIMIT 1000
);
```

Keep production exports and credentials outside the public/static tree and restrict their filesystem access. Recovery must be exercised by the operator with a non-production restore before relying on it. This delivery does not verify remote backup, restore, domain routing, email, D1 region placement or production secret availability. Generic 503 responses intentionally suppress raw D1 errors because SQL/bound values may contain personal information. Monitor platform-level error counts without logging bodies, headers or secrets.

## Verification and launch gates

Local verification completed 2026-09-11: **38/38 backend tests passed**, the standalone Miniflare health smoke returned 200, and the real-Chrome admin workflow test passed. Public HTTPS checks also verified persistence, access control and replay handling on the initial production deployment. Re-run those checks after each release.

The integration suite covers real D1 durability, idempotency races, changed-payload conflict, atomic daily quota races, IP and daily attempt limits, strict input/UTF-8 checks, enum/date/consent/honeypot checks, origin/CORS/CSRF, private access, concurrent review edits, audit trigger, pagination, security headers, nonce admin shell, explicit unconfigured payments, expired-bucket cleanup and non-destructive migration reapplication. Production secrets are never needed for these tests.

Before declaring the release live, the parent should check the actual domain: catalogue loads; `/api/health` returns 200; a clearly labelled operator test application persists; replaying its UUID returns the same ID; a changed payload with that UUID returns 409; cross-origin POST returns 403; a private list without the token returns 401; the console lists the test row and audits a real status change; payment endpoints return 503. Include phone-sized UI verification and a Free-plan CPU/runtime error check. Use only operator-owned test details and mark/handle that test record explicitly.

## Versioned API and future mobile boundary

The web client consumes `/api/v1` as a separate HTTP boundary. Catalogue course/lesson IDs are stable and lesson bodies are structured plain strings, usable by a future mobile renderer. Validation and business rules live on the server, not only in React. Errors, UTC timestamps, cursor pagination, status revisions and idempotency are documented independently of browser screens.

This launch does not implement native screens, mobile sessions, social identity, paid entitlements, grades, synced progress, messaging or push notifications. Future mobile clients must not embed ADMIN_TOKEN or SECURITY_SALT. Add a real identity/authorization path and privacy model before private learner features; choose mobile purchase verification only when there are real products/providers. Keep v1 compatible; version breaking request/response changes. No native project or optional template has been created.

## Implementation references

- [Cloudflare D1 database API and transactional batch semantics](https://developers.cloudflare.com/d1/worker-api/d1-database/)
- [Cloudflare Workers Web Crypto API](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/)
- Wrangler configuration schema is verified from the locally installed 4.131.1 `config-schema.json`; `assets.run_worker_first`, `html_handling`, `ASSETS` and the D1 binding are supported there.
