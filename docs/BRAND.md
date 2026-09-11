# Billion Codes visual identity

## Direction

Human, practical, distinctive. Deep navy (#152b3a), warm ivory (#faf8f2), coral (#ed6541; darker #b63f23 for accessible text), and citrus (#d2f65a). Bricolage Grotesque display type, DM Sans body and IBM Plex Mono technical annotations are self-hosted through Fontsource.

The custom B monogram combines a vertical structural spine with two code-chevron counters. `public/brand/mark.svg` and `mark-light.svg` are original editable vector assets; the public app icons are raster exports. `html-cover.svg` and `practice-cover.svg` are original curriculum illustrations. These are not borrowed from Codecademy.

Codecademy's public homepage was consulted for human-focused presentation, visible learning choices and showing the learning experience. The composition, copy, logo, palette and assets here are independently designed. No testimonials, employer affiliations or learner numbers have been invented.

## Photorealistic imagery

The three learning scenes were generated specifically for Billion Codes on 11 September 2026 using Codex's built-in image-generation tool. They replace the earlier stock images. The people and settings are fictional, not actual students, employees, events or testimonials. The website's imagery page discloses this distinction. Exact prompts and asset paths are recorded in [GENERATED-IMAGERY.md](GENERATED-IMAGERY.md).

| File in public/images | Source | Use |
| --- | --- | --- |
| hero-learner-generated-v1.webp | AI-generated | Fictional learner scene |
| learning-together-generated-v1.webp | AI-generated | Fictional collaboration scene |
| code-detail-generated-v1.webp | AI-generated | Fictional coding workspace |
| founder.webp | Owner-provided portrait already used in Josiah's portfolio | Real founder identity, unchanged |

Generated source PNGs are kept in ignored `.asset-sources/` under the filenames documented with the prompts. `node scripts/prepare-brand.mjs` optimizes them to WebP and exports PNG app icons without modifying the founder portrait. Only pass an owner-portrait argument when intentionally replacing that real photograph. Images are self-hosted, not runtime hotlinks. Framing is CSS object-fit. The committed WebP files are sufficient for normal builds; generation is not part of CI.

Native/mobile distribution uses the same monogram and palette. No trademark clearance or app-store approval is implied by these design assets.
