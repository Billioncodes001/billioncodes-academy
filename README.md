# Billion Codes

**Learn to code. Build real projects. Get expert help.**

A practical software-learning launch: original free introductions, four interactive HTML builds, a device-local learning desk, training applications, and software or mentorship enquiries. Live at [learnatbillioncodes.com](https://learnatbillioncodes.com).

![Billion Codes desktop screenshot](tests/frontend/artifacts/desktop-1440-hero.png)

## Available at launch

- Free authored text lessons and a deterministic HTML knowledge check. No code evaluation or certificates.
- A live course-introduction explorer with real loading, empty, error and retry states.
- Accessible training and project enquiry forms with consent, retained drafts and idempotent submission handling.
- About the founder, verified contact information and clear launch/privacy terms.
- Four HTML exercises with specific structural feedback and sandboxed, non-executing previews.
- Learning desk with drafts, resume, validated JSON backups, confirmed resets and optional public offline downloads. Private forms and admin responses are never cached.
- Original Billion Codes branding, self-hosted fonts, illustrated covers, custom AI-generated learning scenes and the owner's real portrait. See [visual identity](docs/BRAND.md) and [image prompts and provenance](docs/GENERATED-IMAGERY.md).
- Separate [Expo native app](mobile/README.md), sharing content and grading with the web app. Source and exports are tested; native store/device distribution is not yet released.

Paid courses, payments, learner accounts, community features and mobile distribution are not active. Applications are expressions of interest, not confirmed bookings. Project enquiries are not accepted contracts.

## Development and verification

React, TypeScript and Vite on the frontend; a Cloudflare Worker with D1 behind the versioned API. Fonts, images and original vector illustrations are served locally. The build also runs shared learning tests and generates a versioned, public-only offline manifest.

```sh
npm ci
npm run build
npm run test:backend
npx playwright install --with-deps chromium
npm run test:frontend
```

The frontend suite includes 390px and 1440px browser checks, app accessibility scans, error/retry flows, device-only progress, inert-code checks, offline reloads, and actual browser submissions through the local Worker/D1. Arbitrary learner-authored preview contents are outside the app accessibility scan. No production submissions or payments are made by the tests.

See [frontend setup](README.frontend.md), [shared learning contract](docs/LEARNING-CONTRACT.md), [mobile verification](mobile/README.md), and [backend operations](docs/BACKEND.md). GitHub Actions verifies both applications. Cloudflare Builds deploys the website from `main` after its build/shared-learning/backend gates pass; feature branches do not deploy production.

## Preview evidence

[Desktop full page](tests/frontend/artifacts/desktop-1440-full.png) · [Mobile full page](tests/frontend/artifacts/mobile-390-full.png) · [Mobile first viewport](tests/frontend/artifacts/mobile-390-hero.png)

The previews are actual screenshots of this implementation, not placeholder artwork.
