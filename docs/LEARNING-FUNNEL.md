# Learning funnel

Shows where learners progress and where they drop off, without tracking anyone.

**Where to read it:** the private console (`/admin`) → **Learning funnel** (owners and reviewers). Choose the last 7, 30 or 90 days.

## What is counted

| Event | When |
|---|---|
| `home_view` | The homepage is opened |
| `start_path` | A "Start here" path is chosen (subject: `first-web-page`, `practice`, `training`) |
| `lesson_view` / `lesson_complete` | A lesson is opened / marked complete (subject: `course:lesson`) |
| `walkthrough_used` | A learner moves between walkthrough steps (subject: lesson or build) |
| `practice_view` / `practice_check` / `practice_pass` | A build is opened / checked / passed (subject: build id) |
| `course_enrol` | A course is added to a learner's library |
| `training_view` / `application_submitted` | Training is viewed / an application is sent |
| `game_play` | A Debug Defender game starts. Reported outside the learning funnel. |

## Privacy rules

- **Aggregates only.** The `learning_metrics` table (migration `0007`) holds one counter per day, event and subject. There are no visitor IDs, cookies, IP addresses, names, answers or code. Rows older than about 400 days are pruned.
- **Once per visit.** Each step counts at most once per browser tab, using session storage that the browser clears when the tab closes. Read the numbers as "visits that reached this step".
- **Opt-outs.** Browsers sending Do Not Track or Global Privacy Control are never counted, so totals are a floor.
- **No test noise.** Automated browsers (`navigator.webdriver`) are skipped, so CI and scripted checks never touch production numbers.
- **Abuse limits.** 150 events per connection per 10 minutes, keyed by a daily HMAC of the address; the address itself is never stored. Requests over the limit are not counted.
- **Disclosure.** The privacy pages describe all of this under "Anonymous learning statistics". Update them if you add an event.

## Adding a step

1. Add the event to `FUNNEL` in `worker/metrics.js`. The server rejects unknown events.
2. Add it to the `FunnelEvent` type in `src/metrics.ts` and call `track('event', subject)` at the moment it happens.
3. Mention it in both privacy pages.
