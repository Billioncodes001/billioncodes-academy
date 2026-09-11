# Future mobile starter: planning only

This directory is a handoff template, not an installed or compiled mobile app. No Expo dependencies, native project, account system, paid entitlement or progress sync are included in this launch.

## Reuse

1. Fetch the real production catalogue from `GET /api/v1/catalog` over HTTPS. Reuse its stable course and lesson IDs and `body: string[]` text. Never render lesson strings as HTML or execute code from them.
2. Start with catalogue, text reader and deterministic multiple-choice practice screens. Respect loading, empty, error and retry states. Do not substitute local sample data for failed API requests.
3. If native local reading progress is added, make its device-only nature explicit. Do not claim the web browser's localStorage will transfer or sync. Add a clear-progress control.
4. If enquiries are included, follow `api-contract.json`: explicit consent, no attachments, exact field names/enums, UUID idempotency keys retained for unchanged retries, and a new key after edits. Do not embed admin tokens or other secrets.
5. Use the shared versioned API and backend database, not a second mobile backend. Authentication, synced learning records, paid access and push notifications need separate contracts and product decisions before implementation.

## Screen template

| Screen | Source | Required states |
| --- | --- | --- |
| Learning desk | `/api/v1/catalog` | Loading, empty, ready, error with retry |
| Text introduction | Selected course and its lessons | Reading, optional device-only progress, clear progress |
| Practice | Reviewed fixed answer content | Unanswered, correct, explanation with retry |
| Enquiry | Existing v1 POST contract | Draft, validation, submitting, unconfirmed failure, real accepted receipt |

Native UI, platform accessibility, device testing, app-store distribution, data handling and offline downloads are all future work. Do not add an Expo build to the urgent web release pipeline.
