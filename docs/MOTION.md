# Motion system

Every page moves. All motion lives in `src/motion/`, so new pages get it without bespoke animation code. Extend this system; don't add one-off effects inside page components.

## Layers

| Layer | File | What it does |
|---|---|---|
| Motion switch | `prefs.ts` | One on/off state. It starts from `prefers-reduced-motion` and Save-Data, and the header **Motion on/off** toggle can override it (stored on the device). It also sets `html[data-motion]`. |
| Living background | `LivingBackground.tsx`, `simulations.ts` | A fixed 2D canvas behind every route. It runs a pointer-reactive simulation chosen by route (see below). Clicking anywhere sends a ripple through it. It pauses while the tab is hidden and draws one still frame when motion is off. |
| Bug Hunt hero | `HeroStage.tsx`, `heroEngine.ts` | The homepage game: a Three.js city of code blocks that ripples under the cursor, with glowing bugs to squash. It tracks score, combo and level. Three.js is a lazy chunk that loads after first paint. The game stops rendering off screen. Without WebGL it falls back to a CSS grid. The **Fix a bug for me** button makes it playable from the keyboard. |
| Choreography | `primitives.tsx` | `Reveal`, `SplitLines` (masked headline lines; the real text stays in the heading), `Magnetic`, `CountUp`, `Marquee`, `KineticWords`, `ScrollProgress`, Lenis `SmoothScroll`. |
| Site-wide hooks | `primitives.tsx` | `useSpotlightTilt`: any element with `data-tilt` gets a cursor spotlight and a 3D tilt (`data-tilt="flat"` gives the spotlight only). `useAutoReveal` reveals common inner-page blocks as they scroll in. |

## Route → background

| Routes | Simulation |
|---|---|
| Home, courses, library, lessons, resources | `constellation`: a node network that links up and is pulled toward the cursor |
| Practice | `tags`: HTML tags falling like rain; the cursor parts them |
| Training, dashboard, apply | `orbits`: particles circling gravity wells; the cursor becomes a well |
| Services | `flow`: an ink flow field; the cursor stirs it |
| About / contact | `boids`: a flock that scatters from the cursor |
| Everything else | `grid`: a dot matrix with travelling waves |

To give a new route its own background, add a function to `simulations.ts` and map the route in `variantFor()`.

## Rules

- **CSP is strict** (`script-src 'self'; style-src 'self'`). Bundle every library; never use a CDN, inline `<style>` or `style=""` in HTML. React/Motion style props are fine because they write through CSSOM. Don't use Motion's `AnimatePresence mode="popLayout"`, which injects a `<style>` tag.
- **Keep contrast while moving.** Inner-page entrances clip and lift instead of fading, so axe never scans half-transparent text. Homepage `Reveal` fades are fine because they finish before scans.
- **Ambient loops are infinite by design.** Tests wait only for finite animations (`launch.spec.ts`).
- **Motion off means still.** `[data-motion=off]` stops CSS animations; every component checks `useMotionEnabled()`.
- **Performance:** device pixel ratio is capped (1.5 for 2D, 1.75 for WebGL). Bloom only runs on wider screens. Heavy work stops off screen and in hidden tabs.
