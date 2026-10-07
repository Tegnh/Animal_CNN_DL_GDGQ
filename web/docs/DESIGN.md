# Design concept — عُمق (OMQ)

## The central idea: depth you can read like a map

"Deep learning" is a stack of layers. A topographic map is also a stack of layers: each
contour line is one slice through a landscape, and the darker the band, the deeper you are.
The site borrows that language literally. A procedurally generated terrain is cut into
contour bands and painted from pale sage at the shore to near-black green at the deepest
point, like a bathymetric chart printed on cut paper. As the visitor scrolls, the bands slide
at slightly different speeds, so the sheets appear to sit at different heights.

Nothing in the site looks like a brain, a circuit or a glowing node. The only picture of
"AI" is a survey map.

## Palette — one hue, six depths, one warm exception

| Token | Hex | Role |
| --- | --- | --- |
| `--paper` | `#EEF4E9` | page background (pale sage paper) |
| `--mist` | `#DCE9D4` | raised panels, table stripes |
| `--leaf` | `#A9CA9C` | chart fills, text on dark bands |
| `--fern` | `#6C9A68` | secondary chart marks, large rules |
| `--moss` | `#3A6344` | labels, links, primary chart marks |
| `--forest` | `#1C3A2A` | secondary text, buttons |
| `--deep` | `#11271B` | dark bands |
| `--ink` | `#08160E` | body text, deepest contour |
| `--clay` | `#8E3B16` | **only** "unknown" and error states |
| `--clay-wash` | `#F4E1D5` | background of those states |

Light pages carry the content. Deep-forest bands (light text on dark) interrupt them where
the story changes register: the headline numbers, the results, the footer.

Contrast is measured by `scripts/contrast.mjs`; the measured ratios are listed at the end of
this file. Body text is AAA; the smallest labels are at least AA.

## Type

| Use | Face | Notes |
| --- | --- | --- |
| Arabic display | Noto Kufi Arabic 700–900 | geometric, confident, survives very large sizes |
| Latin display | Bricolage Grotesque 700–800 | listed **first** in the display stack, so Latin letters and digits get their own bold face and Arabic falls through to Kufi |
| Body, both scripts | IBM Plex Sans Arabic 400–600 | line-height 1.85 |
| Numbers, technical labels | IBM Plex Mono 400–500 | tabular, Western digits |

Fallback named in every stack: Readex Pro, then the system sans.

The project name is set enormous (up to 13rem). Arabic body text is ~12% larger than a Latin
page would use, with open leading. Technical Latin terms are wrapped in `<bdi dir="ltr">` so
they never reorder the Arabic sentence around them.

## Grid and layout

- Editorial, asymmetric 12-column grid, max width 1320px, 16px gutters on phones.
- Every section has a narrow "margin" column on the start side holding a mono section number
  and a short label, and a wide content column. On phones the margin column folds above.
- Thin hairlines (1px, ink at 16%) separate things. No cards, no shadows, radius 2px at most.
- The 24 classes are a typographic index (number, Arabic name, English name), not icons.
- RTL first: logical properties only; charts that have a label column grow away from the
  labels (right to left); time-series charts keep the conventional left-to-right epoch axis.

## Motion

- Contour bands parallax slowly on scroll (three depths, a few pixels each).
- Sections rise 12px and fade in once, driven by CSS scroll timelines where supported;
  elsewhere they are simply visible.
- The neuron responds live to its sliders. The demo shows real pipeline steps with real
  timings; there are no decorative loaders.
- `prefers-reduced-motion` switches all of it off.

## Components worth naming

- **Depth plate** — the hero terrain (inline SVG from `src/lib/contours.ts`).
- **Margin rail** — numbered section label in the side column.
- **Confidence bar** — a hairline track with a tick at the model's unknown threshold.
- **Verdict** — the large answer. Green tones when a class is named; clay only when the
  answer is "unknown" or something failed.

## Canvas artwork

The art direction for the hero plate, the social image (`public/og.png`, 1200×630) and the
mark (`src/app/icon.svg`) is written up in `docs/ART_PHILOSOPHY.md`. The social image is
rendered from the same contour generator by the `/art/og/` route and captured by
`scripts/verify.mjs --og`.

## Measured contrast

Filled in by `node scripts/contrast.mjs` (see the table it prints).

<!-- contrast:start -->
| Use | Pair | Ratio | WCAG |
| --- | --- | --- | --- |
| Body text | `--ink` on `--paper` | 16.57:1 | AAA |
| Secondary text | `--forest` on `--paper` | 11.11:1 | AAA |
| Labels and small mono text | `--moss` on `--paper` | 6.15:1 | AA |
| Text on raised panels | `--ink` on `--mist` | 14.72:1 | AAA |
| Labels on raised panels | `--forest` on `--mist` | 9.86:1 | AAA |
| Body text on deep bands | `--paper` on `--deep` | 14.10:1 | AAA |
| Labels on deep bands | `--leaf` on `--deep` | 8.73:1 | AAA |
| Button text | `--paper` on `--ink` | 16.57:1 | AAA |
| Unknown / error text | `--clay` on `--clay-wash` | 5.95:1 | AA |
| Unknown / error text on the page | `--clay` on `--paper` | 6.73:1 | AA |
<!-- contrast:end -->
