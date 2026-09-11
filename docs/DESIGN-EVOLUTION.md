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
- Route transitions: consider only if they preserve focus, scroll position and reduced-motion behavior across the existing hash router.

Avoid glass behind long-form reading, decorative 3D scenes on working pages, autoplay video, scroll hijacking, fake AI controls and automatic external design feeds. They add cost or distraction without demonstrating that learners can complete their work more easily.
