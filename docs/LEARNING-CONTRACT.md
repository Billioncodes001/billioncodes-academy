# Shared learning workspace contract

This iteration adds free, device-local learning, not accounts, entitlements or payment.

`packages/learning` exports the public types and functions in `index.d.ts`. Both web and native clients import `@billioncodes/learning` using a file dependency. It is pure JavaScript, with parse5 for inert HTML parsing, and must not depend on browser, Node or native globals. Never run learner JavaScript or load arbitrary learner URLs.

Four authored HTML exercises use stable IDs: `profile-card`, `reading-list`, `contact-form`, `semantic-repair`. `gradeChallenge(id, code)` returns per-goal feedback. `previewHTML(code)` reconstructs a small inert HTML subset; web must still use a sandboxed iframe with no allow flags and native must not enable JavaScript or remote navigation. A text/tree preview is acceptable on native.

Progress contains version 1, read lesson IDs, code drafts, successfully checked solution strings and the last lesson. All changes go through shared normalization/helpers. Solved status is recomputed from actual solutions, not imported booleans. It represents local practice only, never verified certification. The API currently has no progress-write or account endpoints.

`parseCatalog` bounds and validates the existing GET `/api/v1/catalog` response. Native uses https://learnatbillioncodes.com. Do not weaken write Origin checks for a native client: enquiries can open the public web form. A successful public catalogue may be explicitly saved on device for offline reading; show its saved date and distinguish it from a current network response. The built-in `primer` and exercises are original bundled content, not a substitute response. Loading and failed catalogue requests must remain honest.

Local state must not be written before asynchronous hydration completes. Serialize native writes, catch storage failures, and provide separate clear-progress and remove-download controls. Never store enquiry drafts, admin tokens or API private responses in offline caches.

Each draft/solution is limited to 12,000 characters; parsed exercises are bounded to 80 levels and 2,000 nodes. Persistence and backup import allow 1,000,000 characters/bytes because escaped Unicode can make serialized records larger than the editable text. Web writes use Web Locks to rebase updates on the latest stored record; browsers without Web Locks fall back to synchronous best-effort writes, so simultaneous editing there should be avoided. Pending changes trigger the browser's leave-page warning. Native uses its serialized storage queue. Neither client promises synchronization between different devices.

Keep the production main branch untouched until the new code is verified. New mobile code has its own lockfile under `mobile/`; do not force native React versions into the current Vite application. No native store submission, paid build service, push permission, telemetry, or new account integration is authorized by this iteration.
