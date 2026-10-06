# Billion Codes design direction

Research reviewed: 11 September 2026. This is a product design guide, not an automated monitoring job or a claim that every fashionable technique belongs in the product.

## Visual thesis

A bright, focused learning studio: white working surfaces, navy typography, deliberate blue actions and aqua details drawn from the published logo. The homepage can tell a story; the practice lab and dashboards should put the task first. Keep Bricolage Grotesque for character, DM Sans for reading and IBM Plex Mono for technical labels. Preserve the actual logo and existing licensed imagery.

## Research and decisions

| Reference | Useful direction | Application here |
| --- | --- | --- |
| [Linear, March 2026 interface refresh](https://linear.app/now/behind-the-latest-design-refresh) | Quieter navigation and consistent control placement let the work take precedence. | Compact learning headers, a visible active destination and a consistent course-reader frame. Do not copy Linear's dark application theme. |
| [Codecademy, learning paths updated January 2026](https://help.codecademy.com/hc/en-us/articles/220453248-Picking-Your-Learning-Path) | Explicit sequences and milestones help learners understand what to study next. | A four-build HTML sequence with real device-local progress and a next-build link. Completion is not a certificate or a qualification. |
| [Codecademy, current catalogue](https://www.codecademy.com/catalog) | Topic, level, format and price make course choices easier to compare. | Consistent course metadata, existing search and a matching-results count. No artificial catalogue size, ratings or fabricated course images. |
| [web.dev, container queries in action, October 2025](https://web.dev/articles/baseline-in-action-container-queries) | Components can respond to available space rather than only the viewport. | Exercise-title sizing responds to its card; media queries still control the overall layout. Unsupported enhancements leave a usable base layout. |
| [MDN, reduced-motion reference](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion) | Respect the reader's motion preference. | A brief, optional header entrance, no looping animations, and no opacity fade that temporarily reduces text contrast. |
| [GOV.UK, task list](https://design-system.service.gov.uk/components/task-list/) | Associate task links with explicit, accessible status text. Avoid implying a fixed sequence where none exists. | Lesson contents expose completion in text; application links describe their actual current status. No invented review timeline. |
| [Udemy, marking and unmarking lectures](https://support.udemy.com/hc/en-us/articles/229607188-How-to-Mark-or-Unmark-Lectures-as-Complete-on-a-Browser) | Give learners control over completion records and the ability to revisit work. | Explicit mark/undo actions, first-unfinished entry and previous/next navigation. No automatic completion or autoplay. |

These applications are our design decisions, not endorsements from the referenced companies. Research links describe the reviewed state; browser support and product interfaces must be checked again before relying on future changes.

## Applied in this release

- Practice index: numbered builds, readable descriptions, duration metadata, real completion progress and resume/next-build navigation.
- Practice editor: larger code text, clear file and preview labels, an aqua feedback rule and readable safety notes. The existing inert HTML sandbox is unchanged.
- Device learning desk: compact heading, a restrained progress summary and blue/aqua resume and offline surfaces. Account progress and device-only drafts remain explicitly separate.
- Course library: clearer course hierarchy, active portal navigation and consistent surfaces. Account, enrolment and storage access rules are unchanged.
- Course reader: first-unfinished entry from account progress, collapsible contents, previous/next controls and keyboard focus on the selected chapter. Completion changes only after server confirmation, without unmounting the lesson or dropping button focus. Failures retain the reading position. Reading marks remain self-reported, not certificates.
- Training: compact blue/white working pages, Q1/Q4 planning windows and a three-step application guide. Draft, submitted, under-review, offered, declined and withdrawn states each explain the next action. Dates come only from stored records; an offer is not a confirmed place. Application fields lock during saves to avoid losing edits made while a request is in flight.
- Shared brand: no new dependencies, no heavy animation framework, no new stock/generated image downloads and no palette change away from the actual logo.

## Motion and depth, 5 October 2026 (superseded by the Signal redesign below)

The homepage gains art direction with depth; working pages get only quiet entrances. No new dependencies: the 3D is a small perspective renderer on two 2D canvases (about 4 KB gzip JS and 2 KB gzip CSS in total), not WebGL.

- **Orbit scene (homepage hero and finale).** Tilted rings echo the published logo's orbital strokes and carry real HTML/CSS/JS tokens. A back canvas sits behind the portrait and a front canvas over it, so rings wrap the photograph. The caption and build card stay above both canvases. The canvases are `aria-hidden`, deterministic, stop off-screen and in hidden tabs, and never block first paint: the LCP image is unchanged.
- **Pause control (WCAG 2.2.2).** The orbit runs longer than five seconds, so the hero stamp and a finale button pause and resume all orbits (`aria-pressed`, keyboard operable, visible "Pause motion"/"Play motion" hint). The choice lasts for the browser session.
- **Hero entrance.** Headline lines rise from a mask; supporting copy and the visual settle with transforms. Text is never faded, so contrast is constant during motion. Pointer parallax moves the photo, outline and build card at different depths (fine pointers only).
- **Scroll reveals.** Sections and cards move into place once with `translate`/`rotate` only. Offsets apply only after JavaScript adds `html.motion-ok`, which requires reduced motion and Save-Data to be off. The learning steps draw their rules in sequence.
- **Cards.** Course and founder cards tilt slightly toward the pointer with a soft spotlight. Keyboard focus gets the same lift without tilt.
- **Learning pages.** A 320 ms transform-only settle on route change, preserving the existing focus-to-main and scroll reset. Exercise and course cards settle with a short stagger. Editors, the reader and forms have no 3D, parallax or continuous motion.
- **Reduced motion and Save-Data.** One static orbit frame, no reveals, entrances or parallax, and the stamp returns to a decorative mark. The global reduced-motion rule in `styles.css` still overrides everything.

Code lives in `src/motion/` and `src/motion.css` (loaded last, unlayered). The existing infinite-animation-free rule still holds for CSS: the only continuous motion is the pausable canvas, so test helpers that await `document.getAnimations()` still settle.

## Signal redesign, 6 October 2026

A complete visual overhaul, not an added layer: the orbit renderer and `motion.css` are removed, and dead rules from earlier themes were purged.

- **Concept: "Signal".** Night-blue chapters (`--night #040d1c`, `--deep #071b38`) carry the story; white blueprint paper with a faint cobalt grid carries the work. Accents stay strictly blue and white: cobalt `#1652f0` for actions on white (6:1 contrast), signal blue `#5aa9ff` and ice `#e8f3ff` on dark. Red/orange remain only for errors and warnings. Bricolage Grotesque 800 at tight tracking for display type, DM Sans for reading, IBM Plex Mono for annotations. Space Grotesk is no longer loaded.
- **Icons.** `src/Icon.tsx` is a small deterministic inline-SVG set (arrows, check, circle, menu/close, spark, code, mail). Unicode arrows such as U+2197 are emoji-eligible and rendered as colour emoji on iOS course cards; visible UI must not use glyph arrows. `Arrow` points right for in-site steps and up-right only for external links.
- **Code-native covers.** `src/CoverArt.tsx` draws HTML, web and practice-lab covers in SVG (grid, dot matrix, one idea per topic). The live course library, the fallback catalogue and the homepage modules use them.
- **Homepage.** A dot-matrix signal field (`src/motion/SignalField.tsx`, one 2D canvas, about 30 fps, stops off-screen, in hidden tabs, when paused and under reduced motion) behind the hero, and the word BUILD rasterised into the finale field. Includes split-line headline rise, a scroll-linked kinetic word band, a drawn learning pipeline, tilt/spotlight course modules and a dark editor/white preview first-line playground. The pause control (WCAG 2.2.2), `html.motion-ok` gating and transform-only reveals are unchanged in behaviour.
- **Shared chrome.** Night ribbon, white header on working pages (night on the homepage), wrapping navigation for enlarged text, mobile menu panel and a night footer with a large wordmark. Styles live in `src/design/system.css` (tokens, chrome, course discovery, inner-page frame) and `src/design/home.css`, loaded last and unlayered.

## Future page rules

1. Start with the learner's task and an honest data source. Choose a useful primary action before decorating the page.
2. Reuse the studio frame on working pages; do not copy the homepage's large hero onto an editor or dashboard.
3. Use white for reading, navy for structure, blue for actions and aqua for learning context. Keep errors and warnings semantically distinct from brand accents.
4. Make the next step understandable, but never invent progress, placements, instructors, cohort dates, ratings or certificates to fill a design.
5. Research current primary examples and browser support when beginning a substantial new page. Record the reviewed date, rationale and fallback here; do not replace stable patterns simply because a trend exists.
6. Test keyboard access, contrast, narrow screens, enlarged text, reduced motion, empty/error states and existing privacy boundaries before release.

## Candidates, not promises

- Course video/PDF pages: transcript availability and richer media metadata once licensed material exists. Protected download and explicit-play controls are retained and tested with local fixtures, not fabricated production content.
- Training history: consider a timeline only after the backend records historical events. Current status and submitted/updated dates are not evidence of every intermediate review stage.
- Native app: reuse these color and spacing decisions when native authentication and device testing are implemented; this web update does not change native screens.

Avoid glass behind long-form reading, decorative 3D scenes on working pages, autoplay video, scroll hijacking, fake AI controls and automatic external design feeds. They add cost or distraction without demonstrating that learners can complete their work more easily.

## Build Atlas, 6 October 2026

**Concept.** Billion Codes becomes a working atlas for the next generation of builders: dark-blue drawing-board chapters for the story, white measured sheets for the work. The real brand mark, original SVG course art and existing generated imagery stay in place. The treatment is not a stock-site clone; no third-party asset was imported. Sharp registration marks, ruler ticks, coordinates and sheet numbers replace the rounded generic card language.

**Motion architecture.** The homepage has a code-native canvas signal field, a CSS perspective blueprint floor, pointer-responsive hero frame, scroll-linked 3D course plates/editor and a measured kinetic word band. `useHomeMotion` measures only visible sections at most once per animation frame. The learning pages share the atlas geometry but keep reading, form entry, code editing and status controls stationary. A single on-page pause preference now also stops CSS atlas animation; reduced-motion and Save-Data bypass it. No WebGL bundle or new dependency was needed. The existing canvas field is already visibility-aware and its pause control remains accessible.

**Route coverage.** The shared `#main` frame, headers, cards and footer carry the identity through discovery, free lessons, practice, workspace, course/account pages, training applications, resources, policies and contact. Existing route, catalogue, account, progress and application behavior is unchanged. The 3D is decorative and never required to understand a choice or a result. CSS and animation do not hide text while waiting for JavaScript.

**Quality gates.** Check production typecheck/build, learning tests, desktop and phone screenshots, keyboard access, console errors, 320px overflow and reduced motion before release. The current Vite bundle warning concerns the existing application chunk; this redesign adds no runtime package.
