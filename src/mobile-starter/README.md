# Native Mobile Sidecar

The planning-only starter has been replaced by a real Expo / React Native app in [`mobile/`](../../mobile/README.md). This directory remains only as a handoff pointer; it is not imported into the website build.

The app contains a learning desk, bundled HTML primer, live catalog text lessons, four shared HTML practice editors, device-local progress and explicitly downloaded catalog snapshots. Training and privacy links open the public website in the system browser. There is no WebView, learner-script execution, native enquiry POST, account, payment or cloud progress sync.

The app has its own package and lockfile, using `@billioncodes/learning` from `file:../packages/learning`. Shared behavior is specified in [`docs/LEARNING-CONTRACT.md`](../../docs/LEARNING-CONTRACT.md). Follow the mobile README for installation, Expo checks, exports, browser tests and storage details.

Android/iOS JavaScript/Hermes exports are not signed binaries or evidence of device verification. No EAS project, paid service or store submission has been created. See [`mobile/evidence/VERIFICATION.md`](../../mobile/evidence/VERIFICATION.md) for exact results and remaining native release checks.
