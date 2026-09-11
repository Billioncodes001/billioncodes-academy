# Billion Codes

**Learn to code. Build real projects. Get expert help.**

A small, honest launch for a software school: original free coding introductions, device-only reading progress, training applications, and business software or mentorship enquiries.

![Billion Codes desktop screenshot](tests/frontend/artifacts/desktop-1440-hero.png)

## Available at launch

- Free authored text lessons and a deterministic HTML knowledge check. No code evaluation or certificates.
- A live course-introduction explorer with real loading, empty, error and retry states.
- Accessible training and project enquiry forms with consent, retained drafts and idempotent submission handling.
- About the founder, verified contact information and clear launch/privacy terms.

Paid courses, payments, learner accounts, community features and mobile distribution are not active. Applications are expressions of interest, not confirmed bookings. Project enquiries are not accepted contracts.

## Development and verification

React, TypeScript and Vite on the frontend; a Cloudflare Worker with D1 behind the versioned API. Fonts and original HTML/CSS visuals are served locally.

```sh
npm ci
npm run build
npm run test:backend
npx playwright install --with-deps chromium
npm run test:frontend
```

The frontend suite includes 390px and 1440px browser checks, axe accessibility scans, error/retry flows, device-only progress, and actual browser submissions through the local Worker/D1. No production submissions or payments are made by the tests.

See [frontend setup and verification](README.frontend.md) and [backend operations](docs/BACKEND.md) for local development, secrets, migrations and launch constraints. Git, infrastructure and deployment are handled separately by the release operator.

## Preview evidence

[Desktop full page](tests/frontend/artifacts/desktop-1440-full.png) · [Mobile full page](tests/frontend/artifacts/mobile-390-full.png) · [Mobile first viewport](tests/frontend/artifacts/mobile-390-hero.png)

The previews are actual screenshots of this implementation, not placeholder artwork.
