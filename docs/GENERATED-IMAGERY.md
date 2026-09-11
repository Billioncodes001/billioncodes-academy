# Generated imagery

Created 11 September 2026 for Billion Codes using the built-in Codex image-generation tool (`image_gen.imagegen`), not the CLI or API fallback. Each asset was generated separately from text with no reference photographs. These are fictional illustrative scenes, not evidence of actual learners, staff, outcomes or events. The actual founder portrait is unchanged.

## Assets and preparation

| Final website asset | Local source (ignored) | Original generation filename |
| --- | --- | --- |
| `public/images/hero-learner.webp` | `.asset-sources/generated-hero.png` | `exec-b34cabd2-2e8d-4dc9-af15-2fbada02ae4e.png` |
| `public/images/learning-together.webp` | `.asset-sources/generated-together.png` | `exec-dd1ac2bd-a0e5-44ca-bc9a-aecf56f51dc7.png` |
| `public/images/code-detail.webp` | `.asset-sources/generated-code.png` | `exec-1fc44bd6-aa5a-4014-8cee-e90321ebe0b2.png` |

Original PNGs remain in Codex's generated-images directory, with local working copies at the paths above. After copying the sources, run `node scripts/prepare-brand.mjs`. Sharp resizes to at most 1200px wide for the two people scenes and 900px for the course image, without enlargement, and exports WebP at quality 82. No generative edits or facial retouching were applied after generation. Layout crops use CSS `object-fit`.

The deployed WebP assets are committed to Git. Source PNGs are not required for ordinary builds or deployments. Regenerating from the prompts is nondeterministic; retain the source PNGs to reproduce these specific exports. The generated scenes replace earlier stock images; they are not subject to those photographs' attribution. The website keeps its existing `/#/credits` address but now describes the generated imagery instead.

## Exact final prompts

### Hero learner

```text
Create one photorealistic editorial photograph for Billion Codes, an independent Nigerian software learning platform. Portrait orientation 4:5. A fictional Black Nigerian adult woman in her mid twenties, with natural textured hair, wearing a simple navy cotton shirt with a subtle warm coral accessory, genuinely concentrating on an unbranded laptop at a warm wood desk in a refined but believable contemporary learning studio. Natural side-window daylight, warm ivory walls, navy details, subtle foliage out of focus. Beautiful authentic documentary photography, 50mm lens, restrained film color, detailed natural skin texture and fabric, believable hands resting naturally at the keyboard, physically coherent laptop. Quiet, human, aspirational without luxury clichés. Medium environmental portrait: her face prominent in the upper third, centered safely, laptop and desk in lower third. Compose for a tall homepage card: all important features within central 70 percent, quiet darker desk/laptop area in lower third so the WEBSITE can overlay a caption; do not render the caption. No readable screen text, no lettering, no logos, no watermarks, no interface overlays, no artificial glossy skin, no fake bokeh blobs. This is a fictional illustrative learner, not a real student or an endorsement. Deliver only the photograph, no graphic border or collage.
```

### Learning together

```text
Create one photorealistic editorial photograph for Billion Codes, an independent Nigerian software learning platform. Portrait orientation, approximately 4:5, with a spacious near-square-safe central composition. Three fictional Black Nigerian adults in their twenties, two women and one man with clearly individual natural features and hairstyles, collaborating around ONE open unbranded laptop at a warm wooden studio table. One woman seated at the laptop, the others seated beside her looking thoughtfully at its screen, a candid small smile of understanding, not a high five or a staged advertisement. Contemporary modest creative learning workspace, warm ivory wall, large side window, a navy overshirt, soft neutral linen top and one muted coral shirt. True-to-life dark skin tones and textures, natural fabric, physically coherent hands and realistic laptop geometry. Restrained documentary photography with a 50mm lens, natural daylight, warm inviting color, crisp human details rather than glossy artificial skin. Frame all three faces in the upper two thirds with comfortable headroom; leave uncluttered desk surface in lower fifth for a WEBSITE-rendered lime caption label, but put NO text in this photograph. Important subjects inside the central 75 percent, enough environment to feel like real learning. No logos, lettering, watermarks, fake user interface, overly stylized effects or collage. These are fictional illustrative people, not actual students, employees or endorsements. Deliver only the photograph.
```

### Coding workspace

```text
Create one photorealistic editorial still-life photograph for Billion Codes software learning course imagery. Wide landscape composition approximately 5:3. A physically realistic unbranded charcoal laptop open on a warm oak desk in a thoughtful contemporary Nigerian creative learning studio, photographed at a natural three-quarter angle. Laptop screen contains a believable dark navy code editor with subtle small coral, ivory and green syntax-colored lines, slightly out of focus and not intended to be read; no readable words or branded interface. Beside it is a small open ivory notebook with simple nonverbal wireframe sketches, a black pen, and a matte muted coral ceramic mug. Soft side-window daylight, warm ivory background, subtle navy detail, detailed natural material textures and realistic soft shadows. Restrained editorial photography, not a 3D render, not a sterile stock technology scene, no neon or science-fiction UI. Laptop screen central, whole laptop and notebook inside central 80 percent with breathing room, suitable for a 5:3 course thumbnail. No people, no logos, no watermarks, no slogans, no floating code, no graphic overlays, no collage. Deliver only the photograph.
```
