# Native Sidecar Verification

Verified locally on 2026-09-11, using Node 22.17.0, Expo 57.0.22, React Native 0.86.3 and React 19.2.3. The parent-owned shared package was refreshed with `npm ci`; its installed `index.js` was byte-compared to `../packages/learning/index.js` successfully before the final checks.

Final refresh includes the parent's `parseExercise` depth-80/node-2000 guards and reserved-ID rejection. Both source and packed `index.js` have SHA-256 `6eaab42450f2771118bfbed8c5b2a60f409deb594e0a3ffb36f9c6bac7c89a29`. Typecheck, all 19 unit tests, all five browser regressions and all three bundle exports were rerun after this refresh and the final icon/progress-limit polish. Direct assertions against the packed package also confirmed that 2,000 nested opening `div` tags and 2,000 sibling `br` tags return bounded error feedback without throwing, and `recordRead` rejects `constructor` without mutation.

Native progress hydration now accepts at most 1,000,000 serialized characters. A regression constructs four maximum-length null-containing drafts and four real passing solutions whose escaped JSON exceeds 512 KiB, verifies complete hydration, accepts exactly 1,000,000 characters and rejects 1,000,001. Catalog network limits remain independent and unchanged.

## Results

| Command / check | Actual result |
| --- | --- |
| `npm ci --no-fund --no-audit` from mobile | Pass, clean isolated install; 505 packages |
| `npm run typecheck` | Pass, including unit/browser test types |
| `npm test` | 19 tests passed, zero failed/skipped |
| `npx expo install --check` | Dependencies are up to date |
| `npx --yes expo-doctor@1.20.4` | 21/21 checks passed |
| `npm run export -- --max-workers 2` | Web, Android and iOS exports passed |
| `npm run test:ui` | Five Chromium UI tests passed against the final compiled export |
| `LIVE_CATALOG=1 npm run test:ui` | One passed, one failed due to the existing backend Origin policy, detailed below |
| `git diff --check -- mobile src/mobile-starter/README.md` | Pass |

The 19 unit tests cover delayed hydration/no default overwrite, failed reads and recovery, explicit independent reset, serialized writes/reset ordering, failed writes/removals and retry, immutable snapshots, public GET/no credentials, catalog empty/error/shape/size/timeout cases, saved-date validation, forged completion rejection, inherited course-key rejection, deep-markup recovery, escaped-null JSON expansion and all four shared graders.

The five regular browser tests cover 390px and 1024px layouts, actual 192 x 192 PNG decoding of the bundled B monogram, no horizontal page overflow, persistent read marks/drafts/resume, all four editor checklists, successful grading, explicit downloads and catalog-network failure fallback, cancel/confirm/reset independence, corrupt-storage recovery, inert scripts/URLs and a training-link handoff without any POST. They use a clearly named catalog fixture, not claimed production learning content. Screenshots were regenerated with the final monogram and opened for visual inspection.

## Export Evidence

- Web: `dist/_expo/static/js/web/index-b741b9e69079b6c02b7a4990c0aafabd.js`, approximately 648 KB.
- iOS: `dist/_expo/static/js/ios/index-e99690969495540c978794802468b556.hbc`, approximately 1.7 MB.
- Android: `dist/_expo/static/js/android/index-ec82ef881a78117c22803cbbfecc5699.hbc`, approximately 1.7 MB.
- Five bundled font files, each represented in native/web asset exports (10 asset entries). No remotely loaded fonts.
- The bundled 192px B monogram adds two native/web asset entries (12 total). `app.json` configures the approved 512px Expo icon. Both copied PNGs were SHA-256 matched against their original `public/brand/` exports, with dimensions confirmed as 192 x 192 and 512 x 512. Expo Doctor passed 21/21 again with this icon configuration.

These are Metro web and Hermes JavaScript bundle exports, **not APK/AAB/IPA builds or device verification**. Generated output is intentionally gitignored. The next export may produce different content hashes if the shared package changes.

## Screenshots

All screenshots show the actual React Native app rendered by Expo Web, not native hardware or a native simulator. Phone screenshots use a 390 x 844 CSS-pixel viewport; the tablet-width browser screenshot uses 1024 x 1000. Native ScrollView content scrolls within the viewport, so these capture particular visible states rather than an entire long page.

- `desk-phone.png`: main learning desk and bundled primer entry.
- `desk-tablet-web.png`: wider desk layout.
- `practice-overview-phone.png`: all four native exercise selectors.
- `practice-phone.png`: code-editor area and successful per-goal feedback.
- `device-offline-phone.png`: explicitly saved date and saved-catalog fallback after a simulated catalog request failure.

## Live Boundary

The opt-in live suite independently verified an unauthenticated, no-Origin `GET https://learnatbillioncodes.com/api/v1/catalog` returning HTTP 200 with a valid shared catalog schema. It also opened the actual `https://learnatbillioncodes.com/#/training` page through the app's browser link and verified the public form rendered, without submitting it.

The cross-origin browser-preview test fails because the production API returns HTTP 403 for `Origin: http://127.0.0.1:8091`. Chromium therefore cannot expose a live catalog response to that preview. The app correctly shows the catalog failure while keeping the primer/practice usable. No client-side Origin spoof, proxy bypass, backend change or POST exemption was added. If public cross-origin Expo Web access is wanted, the backend owner must explicitly decide a GET-only CORS policy. This does not constitute real-device verification of native networking.

## Remaining Limits

- No native SDK binary build, signing, simulator, physical device, EAS project, store submission or deployment was performed. Xcode is absent; `xcode-select -p` points to Command Line Tools.
- VoiceOver/TalkBack, OS font scaling/keyboard behavior, airplane-mode native cold starts and real AsyncStorage persistence/eviction still need device QA. Controls use native accessibility roles, labels and touch targets of at least 48px; browser automation is not a native accessibility audit.
- `npm audit --omit=dev` reports 10 moderate transitive findings in Expo's `xcode -> uuid` configuration/build chain, with zero high/critical findings. Its suggested SDK 46 downgrade was not applied. See the mobile README for the advisory link.
- The previously reported shared inherited-key and deeply nested HTML issues are fixed in the parent-owned shared package included in the final exports. Native adapters retain their defensive checks and draft-preserving error boundary. This mobile task did not modify shared sources.

## CI Handoff

Use an independent job with `working-directory: mobile`, Node 22, and npm caching keyed to `mobile/package-lock.json`. The required sequence is:

```sh
npm ci
npm run typecheck
npm test
npm run check
npm run export -- --max-workers 2
npx playwright install --with-deps chromium
npm run test:ui
```

Expo Doctor can be an additional check via `npx --yes expo-doctor@1.20.4`; it reads external compatibility metadata. Upload `mobile/evidence/*.png` and optionally ignored `mobile/dist/` as build artifacts, not a deployment. Keep `LIVE_CATALOG=1 npm run test:ui` opt-in rather than a required deterministic CI gate while the production GET Origin policy rejects this preview. No secrets or paid accounts are needed. Root CI remains parent-owned.

## Ownership

Created only `mobile/**`: app/entry/config/manifests, isolated lockfile and npm settings, four source adapters, unit/browser tests, local export server, README and this evidence directory. Updated only `src/mobile-starter/README.md` outside that directory. No root package, shared package, web/backend/config/CI files, git refs, commits, remotes or deployments were changed by this mobile implementation.
