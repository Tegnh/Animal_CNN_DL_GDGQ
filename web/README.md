# عُمق (OMQ) — animal classifier website

A public site for two CNNs that recognise 24 animals, by طارق الفضل. Both
models are exported to ONNX and run **entirely in the visitor's browser** with
`onnxruntime-web`. There is no backend; the site is a static export.

| Route | What it is |
| --- | --- |
| `/` | Introduction: the idea, the three steps, the 24 classes, headline numbers |
| `/model/` | How it works: interactive neuron, network diagram, architectures, training, data, results, limits |
| `/test/` | Live demo: upload, drop or photograph an animal; both models answer |
| `/selftest/` | Not in the navigation. Checks the browser against the Python predictions |
| `/art/og/` | Not in the navigation. The 1200×630 plate that `public/og.png` is captured from |

## Requirements

- Node.js 20.9 or newer
- For `npm run verify` only: Microsoft Edge or Google Chrome installed, and optionally
  Playwright's WebKit (`npx playwright-core install webkit`) for the iPhone checks

## Install, run, build

```bash
cd web
npm install
npm run dev        # http://localhost:3000, also reachable from a phone on the same Wi-Fi
npm run build      # static site in out/
npm run serve      # serves out/ at http://localhost:4173
npm run check      # iOS 15 syntax gate and API list for the built JavaScript (after build)
npm run verify     # browser checks against out/ (run after build)
```

`npm run verify` opens every page at 375px and 1280px and fails on console errors,
horizontal scrolling or touch targets under 44px; runs the live demo on a sample and on
three bad files; runs `/selftest/`; and runs the phone suite (below). Add `-- --og` to
re-capture `public/og.png` (rebuild afterwards) and `-- --shots <folder>` to save screenshots.

## Phones and older iOS

- **Testing from a phone.** `next dev` answers requests from `localhost` only. From any other
  host it returns 403 for every `/_next/*` request, including the HMR socket the client waits
  for, so a page opened at `http://192.168.x.x:3000` renders but never becomes interactive.
  `next.config.mjs` therefore sets `allowedDevOrigins` for the private ranges (192.168.\*,
  10.\*, 172.16-31.\*, \*.local). Restart `npm run dev` after changing it; add other hosts with
  `ALLOWED_DEV_ORIGINS=a.b.c.d`. The static export ignores the setting.
- **Seeing failures.** An inline script in `<head>` (`src/lib/debug-script.ts`) shows a fixed
  banner with the message, file and line when the URL has `?debug=1`, or when React has not
  hydrated 4 seconds after load. It runs before React, so it works when the bundles fail.
- **Targets.** `browserslist` in `package.json` is `iOS >= 15, Safari >= 15` plus the last two
  Chrome, Edge and Firefox versions. `npm run check` parses every built chunk and fails on syntax
  newer than iOS 15.0 (class static blocks, regex lookbehind, regex `d`/`v` flags). It also lists
  uses of newer APIs. Class fields and `??=` remain in the output because Safari has had them
  since 14.x. The head script adds fallbacks for `Array/String.at`, `Object.hasOwn` and
  `Array.findLast`, which Next's router uses and iOS 15.0-15.3 lacks.
- **WebAssembly SIMD.** `onnxruntime-web` 1.30 ships only SIMD builds, which Safari supports from
  16.4. On older iOS the demo says so in Arabic instead of failing silently.
- **Loading.** On `/test/` Model B downloads first, then Model A, one at a time, with real
  byte progress, a 30 s stall timeout and a retry button. The runtime runs without threads and
  without a worker (`numThreads = 1`, `proxy = false`).
- **Phone suite.** `npm run verify` runs `scripts/mobile-suite.mjs` with the iPhone 11 profile
  against the production export, over the machine's LAN address (a non-secure `http` origin).
  It checks that the sliders change the numbers, a gallery click gives a result, and uploads of a
  4032×3024 JPEG with EXIF orientation 6, a PNG, a 1×1 image and a HEIC file each end in a result
  or a clear message. It uses WebKit when it can start. When it cannot (for example when a
  Windows Application Control policy blocks Playwright's WebKit DLLs), it runs in Chromium with the
  same profile and prints that this is not a Safari test. `npm run verify -- --require-webkit`
  makes that case a failure, which is what a CI machine should use.

`npm run build` also runs `scripts/fix-export.mjs`. On Windows, Next.js 16 writes its
per-segment prefetch files into nested folders where the router expects dotted file names;
the script flattens them. On Linux, macOS and Vercel it finds nothing to do.

## Where things live

```
public/model/      ONNX models, labels, model card, reference predictions, sample images
public/reports/    plots (PNG) and tables (CSV) from the training notebook
src/site.config.ts project name, subtitle, author name and links, site URL, upload limit
src/lib/data.ts    build-time readers for everything in public/ (the only source of numbers)
src/lib/preprocess.ts, jpeg.ts, ort.ts   the in-browser inference pipeline
src/lib/classes.ts Arabic names of the classes
docs/DESIGN.md     design concept, palette, type, measured contrast
```

No number shown on the site is typed into a page. Pages read `model_card.json`,
`onnx_meta.json`, `labels.json`, `reference_predictions.json` and the CSV files at build
time, so a rebuild is all it takes to match new training results.

## Replacing the models

1. Overwrite the files in `public/model/` with the new export, keeping the same names:
   `custom_cnn.onnx`, `efficientnet_b0.onnx`, `labels.json`, `model_card.json`,
   `onnx_meta.json`, `reference_predictions.json`, `samples/<class>.jpg`.
2. Overwrite `public/reports/` with the new plots and CSV files.
3. If the class list changed, add the Arabic names in `src/lib/classes.ts` (a missing
   name falls back to the English label).
4. `npm run build && npm run verify`. The self-test must report PASS for both models.

Input and output tensor names, thresholds and file sizes are read from the JSON files.
Model URLs carry a content hash (`?v=…`), so the long cache headers in `vercel.json` never
serve a stale model.

The block-by-block parameter counts of the custom CNN on `/model/` are computed from
`model_card.json` (`filters`, `inner_size`) assuming the current block design: two 3×3
convolutions without bias, each followed by batch normalisation, then max pooling. If the
computed total does not equal `parameters` in the model card, the page says so and shows
only the total. The EfficientNetB0 stage list in `src/lib/arch.ts` is the published
architecture and does not depend on training.

## How the browser matches Python

`/selftest/` runs both models on the 24 samples and compares the probabilities with
`reference_predictions.json`. Pass means 100% top-1 agreement and a maximum absolute
probability difference below 0.02. Three things make it pass:

- **Resize.** The final 224×224 resize is a hand-written copy of `tf.image.resize`
  bilinear (half-pixel centres, no antialiasing). Canvas smoothing is used only to shrink
  photos larger than 384px on the long side, as the data preparation did.
- **JPEG decoding.** TensorFlow decodes JPEGs with libjpeg's fast integer IDCT; browsers use
  the accurate one. The pixels differ by a level or two, which moved probabilities by up to
  0.04 and flipped one near-tie. `src/lib/jpeg.ts` is a small baseline decoder that
  reproduces TensorFlow's output bit for bit. It is used for JPEGs that are already
  dataset-sized (long side ≤ 384px, no EXIF rotation), which includes all samples.
  Everything else (large photos, PNG, WebP, progressive JPEG) uses the browser's decoder.
- **No normalisation in JavaScript.** The models take raw 0–255 values; scaling is inside
  them.

## Deploying to Vercel

1. Push the repository and import it in Vercel.
2. Set **Root Directory** to `web` and **Framework Preset** to **Next.js**. Leave the build
   command (`npm run build`) and output settings at their defaults; `next.config.mjs`
   already sets `output: 'export'`.
3. Deploy, then set `url` in `src/site.config.ts` to the real address (it is used for the
   social image URL) and redeploy.

`vercel.json` adds one-year immutable caching for `/model/*.onnx` and `/model/*.jpg`.

The ONNX runtime's WebAssembly files are loaded from jsDelivr, pinned to the exact
`onnxruntime-web` version in `node_modules` (read in `next.config.mjs`). The visitor's
photo never leaves the device; only the runtime and the two model files are downloaded.
