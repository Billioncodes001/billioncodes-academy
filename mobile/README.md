# Billion Codes Native Learning Desk

A real Expo / React Native sidecar, not a website wrapper. The application uses native `Text`, `View`, `TextInput`, `ScrollView`, `Pressable`, safe areas and a confirmation modal. There is no WebView or execution of learner HTML/JavaScript.

## Run Locally

Use Node 22.13 or newer (tested with 22.17.0). Run these commands **from `mobile/`**, not the website root:

```sh
npm ci
npm start
```

The current Expo SDK 57 runtime is required for Expo Go or a development client. No account, EAS configuration, paid service, signing credentials or app-store submission is included. Simulator/device launch requires native tools; exporting a bundle does not install a native app.

For a browser preview of the same React Native components, run `npm run web`.

The app uses its own dependency manifest and lockfile. `@billioncodes/learning` remains `file:../packages/learning`. The mobile `.npmrc` sets `install-links=true` so npm packs that local package and installs its `parse5` dependency inside mobile rather than relying on the website's `node_modules`. After editing shared sources, rerun `npm ci` from mobile to refresh the packed copy. Root dependency files are not involved.

## Included

- Desk: bundled HTML primer, current public catalog, resume, device-only read counts and checked exercises.
- Lessons: all catalog `body` paragraphs rendered as inert native text, with navigation and read/unread marks.
- Practice: four separate drafts for `profile-card`, `reading-list`, `contact-form`, and `semantic-repair`; shared `gradeChallenge` feedback for each goal; bounded multiline editing and confirmed starter restoration.
- Device: explicit catalog download/update, saved timestamp, labeled saved-copy fallback after a failed live request, independent confirmed progress reset and download removal.
- Branding: bundled Bricolage Grotesque, DM Sans and IBM Plex Mono fonts; navy/ivory surfaces and lime/coral accents. Only five font weights are bundled, with no runtime font-server requests.
- The original Billion Codes B monogram is bundled as a native header Image; Expo's app icon uses the approved 512px export. Both PNGs are exact copies from the parent-owned `public/brand/` assets.
- Public links: `https://learnatbillioncodes.com/#/training` and `/#/policies`, opened in the system browser. The native app never posts an enquiry or adds an Origin exemption.
- The September 2026 account release changes that browser destination to the intake landing page and a Firebase-backed training dashboard. Learners sign in there before applying. Native Firebase sign-in and account-progress sync inside the mobile app are not implemented yet; local practice data remains device-only.

## Storage And Network

`src/storage.ts` serializes writes and removals, captures snapshots before queueing, and blocks editing until hydration completes. Failed or malformed reads do not write defaults. The user can retry a read or explicitly confirm a reset. Failed writes retain the in-memory snapshot, show an error and expose a save retry. Do not close the app before pending writes finish if you need those edits preserved.

The AsyncStorage keys are `native:${WORKSPACE_KEY}` and `native:${CATALOG_KEY}`, using the shared package's versioned keys. Progress contains only read lesson IDs, drafts, checked solution strings and the last lesson. Hydration uses shared normalization, including regrading stored solutions rather than trusting completion booleans. Reset only removes its own key; `AsyncStorage.clear()` is never used.

Serialized progress hydration permits up to 1,000,000 characters, allowing JSON-escaped control characters across all four drafts and checked solutions without rejecting valid saved state. The catalog's independent 512 KiB network bound is unchanged.

AsyncStorage is device-local application storage, **not an encrypted vault**. It does not sync with the website or another device. Do not enter credentials, private code or confidential material in drafts. There are no enquiry drafts, admin tokens, accounts, payments or telemetry in this client.

`src/catalog.ts` makes only `GET https://learnatbillioncodes.com/api/v1/catalog`, omits credentials, times out after 12 seconds and validates the response with shared `parseCatalog`. The production Expo fetch adapter supports bounded streaming; declared or streamed bodies over 512 KiB are rejected. Nothing is downloaded automatically: saving a catalog is explicit, with an ISO timestamp. The primer is always labeled as bundled content, never substituted as a fake API response.

A native installation includes the primer, exercises and fonts. An explicitly downloaded catalog can be read without the network in that installation. The Expo web export is a preview, not an offline-installable PWA; its app shell still needs to be served. Native cold-start/offline behavior must also be checked on real devices before distribution.

## Verification

```sh
npm run typecheck
npm test
npx expo install --check
npx --yes expo-doctor@latest
npm run export -- --max-workers 2
npx playwright install chromium
npm run test:ui
LIVE_CATALOG=1 npm run test:ui
```

The last command is an opt-in, read-only smoke test against the public catalog and training page. Regular UI tests use clearly named fixtures and simulated catalog failures. UI tests serve the compiled Expo web export from `dist/` on loopback port 8091. Nothing is deployed.

Unit tests cover slow hydration, failed/malformed reads, ordered writes, reset races, disk failures/retry, independent keys, catalog limits/timeouts, saved dates and all four shared graders. UI tests cover phone/tablet layout, read marks, resume, persistent drafts, four-editor feedback, explicit download/offline fallback, confirmations, corruption recovery, inert markup and no POST requests.

See `evidence/VERIFICATION.md` for actual results and screenshot provenance. Bundles live in ignored `dist/`; traces and transient test output are also ignored.

## Distribution Limits

This is implemented source plus tested exports, not a released mobile product. No APK, AAB or IPA has been built or signed, and no physical Android/iOS device or simulator has been verified. Xcode is not installed on this host; only Command Line Tools are present. Before distribution, test keyboard behavior, font scaling, safe areas, VoiceOver/TalkBack, storage eviction, cold starts, airplane mode and native browser handoff on real devices. App identifiers, icons, splash screens, signing and store/privacy metadata require a separate reviewed release task.

SDK selection was checked on 2026-09-11 against the [official Expo SDK reference](https://docs.expo.dev/versions/latest/) and official npm registry: Expo `57.0.22`, React Native `0.86.3`, React `19.2.3`. The lockfile records installed compatible versions.

`npm audit --omit=dev` reported 10 moderate transitive findings originating from `xcode -> uuid` in Expo configuration/build tooling, with no high/critical findings. Its proposed automatic fix downgrades Expo to SDK 46 and was intentionally not applied. Track the [upstream UUID advisory](https://github.com/advisories/GHSA-w5hq-g745-h8pq) and compatible Expo tooling updates before native release; this is not a clean vulnerability audit claim.
