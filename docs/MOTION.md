# Motion system

Every page moves. All motion lives in `src/motion/`, so new pages get it without bespoke animation code. Extend this system; don't add one-off effects inside page components.

## Layers

| Layer | File | What it does |
|---|---|---|
| Motion switch | `prefs.ts` | One on/off state. It starts from `prefers-reduced-motion` and Save-Data, and the header **Motion on/off** toggle can override it (stored on the device). It also sets `html[data-motion]`. |
| Living background | `LivingBackground.tsx`, `simulations.ts` | A fixed 2D canvas behind every route. It runs a pointer-reactive simulation chosen by route (see below). Clicking anywhere sends a ripple through it. It pauses while the tab is hidden and draws one still frame when motion is off. |
| Particle hero + Debug Defender | `HeroStage.tsx`, `particleHero.ts` | About 13,000 glowing particles (5,200 on phones) morph between the headline words, scatter from the cursor and explode on click. **Play Debug Defender** turns the hero into an arcade game. Bugs swarm a `</>` code core, and you click or tap to zap them. It has waves, a boss every third wave, combos up to ×8, a refactor pulse at a ×5 combo, a code-integrity bar, a game-over screen that links to courses, and a personal best saved on the device. Glow is drawn in the shader (no bloom pass). The clouds disable frustum culling because their positions change every frame. The bug sprites are double-sided because the screen-pixel camera flips the winding order. Three.js is a lazy chunk. **Zap nearest bug** and Esc make the game keyboard-usable.
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

| Night theme | `dark.css` (generated), `motion.css` | `scripts/generate-dark-theme.mjs` reads the original stylesheets. It emits overrides for every light surface, dark text colour and border, resolving brand tokens, so every page goes dark without hand edits. Rerun it after changing those stylesheets. Homepage sections are styled directly in `motion.css`. |
| Cursor and curtain | `primitives.tsx` | A glowing cursor (dot plus lagging ring; it turns into a crosshair during the game) on fine pointers. A blue wipe sweeps across on every route change. `Scramble` decodes kicker labels when they scroll into view. |

## Rules

- **CSP is strict** (`script-src 'self'; style-src 'self'`). Bundle every library; never use a CDN, inline `<style>` or `style=""` in HTML. React/Motion style props are fine because they write through CSSOM. Don't use Motion's `AnimatePresence mode="popLayout"`, which injects a `<style>` tag.
- **Keep contrast while moving.** Inner-page entrances clip and lift instead of fading, so axe never scans half-transparent text. Homepage `Reveal` fades are fine because they finish before scans.
- **Ambient loops are infinite by design.** Tests wait only for finite animations (`launch.spec.ts`).
- **Motion off means still.** `[data-motion=off]` stops CSS animations; every component checks `useMotionEnabled()`.
- **Performance:** device pixel ratio is capped (1.5 for 2D, 1.75 for WebGL). Bloom only runs on wider screens. Heavy work stops off screen and in hidden tabs.
