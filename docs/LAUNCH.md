# Production launch

Public site: https://learnatbillioncodes.com (also https://www.learnatbillioncodes.com).
Repository: https://github.com/Billioncodes001/billioncodes-academy.

Cloudflare Worker `billioncodes-academy` uses D1 `billioncodes-academy-db`.
The real database ID is tracked in `wrangler.jsonc`; admin and hashing secrets are encrypted Worker secrets, not repository content.

## Automatic deployment

Cloudflare Workers Builds is connected to this repository's `main` branch. Preview-branch builds are disabled.

- Build: `npm run build && npm run test:backend`
- Deploy: `npm run db:migrate:remote && npx wrangler deploy`

GitHub Actions independently runs the backend and desktop/mobile browser suites. Check both GitHub CI and Cloudflare build status before presenting a new release. Direct pushes can deploy before the independent browser suite completes; use reviewed merges for future changes.

## Operating the launch

Private enquiries: https://learnatbillioncodes.com/admin. Enter the separately provisioned admin token on a trusted device. Reloading clears the in-memory token. Do not put it in a URL, GitHub, screenshots or frontend configuration.

Enquiries are stored, not emailed. Review the inbox, contact applicants yourself, and mark reviewed records contacted or closed. Define retention and backups before collecting sustained traffic.

The launch includes free introductory lessons, device-only progress and enquiries. Paid checkout, confirmed enrolment, learner accounts, community, certificates and a distributed native mobile app are unavailable.

The owner selected Workers Paid ($5/month plus usage). Both sites share that account plan. No additional hosting purchase was made; runtime CPU is capped at 50 ms per request, not a total monthly spending cap.
