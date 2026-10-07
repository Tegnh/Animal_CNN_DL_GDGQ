// Interaction checks for a phone browser, run against the production export.
// verify.mjs runs this in WebKit with the iPhone 11 profile when WebKit can start, and
// otherwise in Chromium with the same profile (labelled as such: it is not Safari).
import { Buffer } from 'node:buffer';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Splices an EXIF segment that carries only the orientation tag into a JPEG. */
function withExifOrientation(jpeg, orientation) {
  const tiff = Buffer.from([
    0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, // little-endian header, IFD at 8
    0x01, 0x00, // one entry
    0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, orientation, 0x00, 0x00, 0x00, // Orientation = SHORT 1 value
    0x00, 0x00, 0x00, 0x00, // no next IFD
  ]);
  const exif = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]);
  const length = exif.length + 2;
  const app1 = Buffer.concat([Buffer.from([0xff, 0xe1, length >> 8, length & 255]), exif]);
  return Buffer.concat([jpeg.subarray(0, 2), app1, jpeg.subarray(2)]);
}

/** Draws a sample photo into canvases of the sizes the tests need and returns the file bytes. */
async function makeFixtures(page) {
  const encoded = await page.evaluate(async () => {
    const toBase64 = (blob) =>
      new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1]);
        reader.readAsDataURL(blob);
      });
    const source = await createImageBitmap(await (await fetch('/model/samples/lion.jpg')).blob());
    const draw = (width, height, type, quality) =>
      new Promise((resolve) => {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(source, 0, 0, width, height);
        canvas.toBlob(resolve, type, quality);
      });
    return {
      jpeg: await toBase64(await draw(4032, 3024, 'image/jpeg', 0.8)),
      png: await toBase64(await draw(640, 480, 'image/png')),
      tiny: await toBase64(await draw(1, 1, 'image/png')),
    };
  });
  const jpeg = Buffer.from(encoded.jpeg, 'base64');
  return {
    jpegExif6: withExifOrientation(jpeg, 6),
    png: Buffer.from(encoded.png, 'base64'),
    tiny: Buffer.from(encoded.tiny, 'base64'),
    // A genuine HEIC needs an encoder; this has the real 'ftyp heic' signature, which is what
    // the site's HEIC detection reads. Only Safari itself could decode a real one.
    heic: Buffer.concat([
      Buffer.from([0x00, 0x00, 0x00, 0x18]),
      Buffer.from('ftypheic', 'latin1'),
      Buffer.from([0, 0, 0, 0]),
      Buffer.from('mif1heic', 'latin1'),
      Buffer.alloc(64, 7),
    ]),
  };
}

async function outcome(page, timeout = 90_000) {
  await sleep(400); // let React take the change event and clear the previous result
  await page.waitForFunction(
    () =>
      !document.querySelector('li[data-state="doing"]') &&
      (document.querySelector('article[class*="primary"]') || document.querySelector('p[role="alert"]')),
    null,
    { timeout },
  );
  const text = async (selector) => ((await page.locator(selector).count()) ? page.locator(selector).first().innerText() : null);
  return {
    alert: await text('p[role="alert"]'),
    primary: await text('article[class*="primary"]'),
    pipeline: await text('div[class*="pipeline"]'),
  };
}

export async function runMobileSuite({ label, browser, contextOptions, base, fail }) {
  const check = (condition, message) => {
    console.log(`  ${condition ? 'ok  ' : 'FAIL'} ${message}`);
    if (!condition) fail(`[${label}] ${message}`);
  };
  console.log(`\n== ${label} @ ${base} ==`);

  const context = await browser.newContext(contextOptions);
  const problems = [];
  const watch = (page) => {
    page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text()}`));
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    page.on('response', (r) => r.status() >= 400 && problems.push(`HTTP ${r.status()}: ${r.url()}`));
  };
  const hydrated = (page) =>
    page.waitForFunction(() => document.documentElement.dataset.hydrated === 'true', null, { timeout: 30_000 });

  // -- /model/: the sliders must change the numbers -------------------------------------
  {
    const page = await context.newPage();
    watch(page);
    await page.goto(`${base}/model/`, { waitUntil: 'load' });
    await hydrated(page).catch(() => {});
    check(await page.evaluate(() => document.documentElement.dataset.hydrated === 'true'), '/model/ hydrates');
    const math = page.locator('[class*="math"]').first();
    const before = await math.innerText();
    await page.locator('#neuron-x0').fill('0.2');
    await page.locator('#neuron-w1').fill('1.5');
    const after = await math.innerText();
    check(before !== after, `neuron output changes with the sliders (${before.split('=').pop().trim()} -> ${after.split('=').pop().trim()})`);
    check(/0\.20/.test(after) && /1\.50/.test(after), 'the new slider values appear in the sum');
    await page.close();
  }

  // -- the banner: ?debug=1, and JavaScript that never arrives ---------------------------
  {
    const page = await context.newPage();
    watch(page);
    await page.goto(`${base}/model/?debug=1`, { waitUntil: 'load' });
    await hydrated(page).catch(() => {});
    const banner = page.locator('div[role="alert"]').filter({ hasText: 'وضع التشخيص' });
    check((await banner.count()) === 1, '?debug=1 shows the diagnostic banner');
    check(await page.evaluate(() => document.documentElement.dataset.hydrated === 'true'), 'the banner does not break hydration');
    await page.addScriptTag({ content: 'setTimeout(function(){ throw new Error("planted boom"); }, 0);' });
    await sleep(500);
    const text = await banner.innerText();
    check(/planted boom/.test(text) && /:\d+:\d+/.test(text), 'a runtime error shows its message, file and line');
    await page.close();

    const dead = await context.newPage();
    await dead.route('**/_next/static/chunks/**', (route) => route.abort());
    await dead.goto(`${base}/model/`, { waitUntil: 'load' });
    check((await dead.locator('div[role="alert"]').count()) === 0, 'no banner at first when nothing failed yet is visible');
    await sleep(5000);
    const text2 = await dead.locator('div[role="alert"]').first().innerText().catch(() => '');
    check(/تعذّر تشغيل جافاسكربت/.test(text2), 'dead JavaScript produces the banner within 4 s of load');
    check(/Failed to load script/.test(text2), 'the banner names the file that failed to load');
    await dead.close();
  }

  // -- /test/ -----------------------------------------------------------------------------
  const page = await context.newPage();
  watch(page);
  await page.addInitScript(() => {
    window.__loadLog = [];
    const record = () => {
      const state = Array.from(document.querySelectorAll('[data-status]')).map((el) => el.dataset.status).join('|');
      if (state && window.__loadLog[window.__loadLog.length - 1] !== state) window.__loadLog.push(state);
    };
    new MutationObserver(record).observe(document, { subtree: true, attributes: true, childList: true });
  });
  await page.goto(`${base}/test/`, { waitUntil: 'load' });
  await hydrated(page).catch(() => {});
  check(await page.evaluate(() => document.documentElement.dataset.hydrated === 'true'), '/test/ hydrates');

  await page
    .waitForFunction(() => document.querySelectorAll('[data-status="ready"]').length === 2, null, { timeout: 180_000 })
    .catch(() => {});
  const log = await page.evaluate(() => window.__loadLog);
  const ready = (await page.locator('[data-status="ready"]').count()) === 2;
  check(ready, 'both models reach "ready"');
  const violation = log.find((state) => {
    const [b, a] = state.split('|');
    return a === 'loading' && b !== 'ready';
  });
  check(!violation, `Model B is ready before Model A starts loading (${log.length} states: ${log.join(' > ')})`);

  if (ready) {
    // gallery click
    await page.locator('ul[class*="samples"] button').first().click();
    let result = await outcome(page);
    check(Boolean(result.primary) && /%/.test(result.primary), 'a gallery click produces a result');

    const input = page.locator('input[type="file"]').first();
    const fixtures = await makeFixtures(page);

    await input.setInputFiles({ name: 'IMG_0001.JPG', mimeType: 'image/jpeg', buffer: fixtures.jpegExif6 });
    result = await outcome(page);
    check(Boolean(result.primary), `4032x3024 JPEG with EXIF 6 classifies (${(fixtures.jpegExif6.length / 1024).toFixed(0)} kB)`);
    check(/3024×4032/.test(result.pipeline ?? ''), `EXIF rotation is honoured: the pipeline reads ${(result.pipeline ?? '').match(/\d+×\d+/)?.[0]} (expected 3024×4032)`);
    check(/288×384/.test(result.pipeline ?? ''), 'it is shrunk to 288×384 before the final resize');

    await input.setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: fixtures.png });
    result = await outcome(page);
    check(Boolean(result.primary), 'PNG classifies');

    await input.setInputFiles({ name: 'tiny.png', mimeType: 'image/png', buffer: fixtures.tiny });
    result = await outcome(page);
    check(Boolean(result.primary), '1x1 PNG classifies');

    await input.setInputFiles({ name: 'IMG_0002.HEIC', mimeType: 'image/heic', buffer: fixtures.heic });
    result = await outcome(page);
    check(Boolean(result.alert) && /HEIC/.test(result.alert), `HEIC gets a clear message, never silence: "${result.alert}"`);

    await input.setInputFiles({ name: 'IMG_0003.HEIC', mimeType: '', buffer: fixtures.heic });
    result = await outcome(page);
    check(Boolean(result.alert) && /HEIC/.test(result.alert), 'HEIC with an empty MIME type is accepted as an image file and explained');
  }

  const real = problems.filter((p) => !/decode|could not be decoded|Failed to load resource.*(heic|HEIC)|planted boom|ERR_FAILED|net::ERR_ABORTED/i.test(p));
  check(real.length === 0, `no console errors or failed requests${real.length ? `: ${real.slice(0, 3).join(' | ')}` : ''}`);
  await context.close();
}
