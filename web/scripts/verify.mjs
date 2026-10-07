// End-to-end check of the exported site in a real browser (Edge or Chrome).
// Usage: npm run build && npm run verify [-- --og] [-- --shots <dir>] [-- --require-webkit]
//   --og              also capture /art/og/ to public/og.png (rebuild afterwards)
//   --shots           save full-page screenshots to <dir>
//   --require-webkit  fail (instead of falling back) when WebKit cannot be launched
//
// The phone suite (scripts/mobile-suite.mjs) uses the iPhone 11 profile. It runs in WebKit
// when Playwright's WebKit can start; if the machine blocks it, it runs in Chromium with the
// same profile and says so. That fallback is NOT a Safari test.
import { mkdirSync, writeFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, devices, webkit } from 'playwright-core';
import { runMobileSuite } from './mobile-suite.mjs';
import { startServer } from './serve.mjs';

const args = process.argv.slice(2);
const shots = args.includes('--shots') ? args[args.indexOf('--shots') + 1] : null;
const PORT = 4319;
const base = `http://localhost:${PORT}`;
const failures = [];
const fail = (message) => {
  failures.push(message);
  console.log(`  FAIL ${message}`);
};

const server = await startServer(PORT);
let browser;
for (const channel of ['msedge', 'chrome']) {
  try {
    browser = await chromium.launch({ channel });
    break;
  } catch {
    // try the next installed browser
  }
}
if (!browser) throw new Error('Neither Edge nor Chrome could be launched.');

async function open(path, viewport) {
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce', locale: 'ar' });
  const page = await context.newPage();
  const problems = [];
  page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text()}`));
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  // The Next.js router probes page URLs and aborts the request itself; that is not a failure.
  page.on('requestfailed', (r) => {
    if (r.failure()?.errorText !== 'net::ERR_ABORTED') problems.push(`requestfailed: ${r.url()}`);
  });
  page.on('response', (r) => r.status() >= 400 && problems.push(`HTTP ${r.status()}: ${r.url()}`));
  await page.goto(base + path, { waitUntil: 'networkidle' });
  return { context, page, problems };
}

const viewports = [
  { name: 'phone', width: 375, height: 812 },
  { name: 'desktop', width: 1280, height: 900 },
];

for (const path of ['/', '/model/', '/test/']) {
  for (const viewport of viewports) {
    const { context, page, problems } = await open(path, viewport);
    if (path === '/test/') {
      await page.waitForFunction(
        () => document.querySelectorAll('[data-status="ready"]').length === 2,
        null,
        { timeout: 120_000 },
      );
    }
    const overflow = await page.evaluate(() => {
      const width = document.documentElement.clientWidth;
      const wide = [...document.querySelectorAll('body *')].filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && (r.left < -1 || r.right > width + 1) && !el.closest('svg, .table-scroll, [class*="plate"], [class*="bandArt"], .page-head__art');
      });
      return {
        scroll: document.documentElement.scrollWidth - width,
        wide: wide.slice(0, 5).map((el) => `${el.tagName}.${String(el.className).slice(0, 40)}`),
      };
    });
    const small = await page.evaluate(() =>
      [...document.querySelectorAll('a, button, input, summary, label.btn')]
        .filter((el) => {
          const r = el.getBoundingClientRect();
          const inline = el.tagName === 'A' && getComputedStyle(el).display === 'inline';
          return r.width > 0 && !inline && !el.classList.contains('sr-only') && r.height < 44;
        })
        .map((el) => `${el.tagName} "${el.textContent.trim().slice(0, 24)}" ${Math.round(el.getBoundingClientRect().height)}px`),
    );
    console.log(`${path} @ ${viewport.name}: overflow ${overflow.scroll}px, ${problems.length} problems`);
    if (overflow.scroll > 0) fail(`${path} @ ${viewport.name} scrolls horizontally by ${overflow.scroll}px`);
    if (overflow.wide.length) fail(`${path} @ ${viewport.name} elements outside viewport: ${overflow.wide.join(', ')}`);
    if (small.length) fail(`${path} @ ${viewport.name} small touch targets: ${small.join(' | ')}`);
    for (const p of problems) fail(`${path} @ ${viewport.name} ${p}`);
    if (shots) {
      mkdirSync(shots, { recursive: true });
      const name = `${path.replaceAll('/', '') || 'home'}-${viewport.name}.png`;
      await page.screenshot({ path: join(shots, name), fullPage: true });
    }
    await context.close();
  }
}

// The live demo: one sample, one bad file, one oversized file.
{
  const { context, page, problems } = await open('/test/', viewports[0]);
  await page.locator('ul[class*="samples"] button').first().click();
  await page.waitForSelector('article[class*="primary"]', { timeout: 120_000 });
  await page.waitForFunction(() => !document.querySelector('li[data-state="doing"], li[data-state="todo"]'));
  const text = (selector) => page.locator(selector).innerText();
  console.log('demo primary  :', (await text('article[class*="primary"]')).replace(/\s+/g, ' ').slice(0, 160));
  console.log('demo secondary:', (await text('article[class*="secondary"]')).replace(/\s+/g, ' ').slice(0, 160));
  console.log('demo pipeline :', (await text('div[class*="pipeline"]')).replace(/\s+/g, ' '));
  if (shots) await page.screenshot({ path: join(shots, 'test-result-phone.png'), fullPage: true });

  const picker = page.locator('input[type="file"]').first();
  await picker.setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
  console.log('demo bad file :', await text('p[role="alert"]'));
  await picker.setInputFiles({ name: 'broken.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('not a jpeg') });
  await page.waitForFunction(() => document.querySelector('p[role="alert"]')?.textContent.includes('JPG'));
  console.log('demo broken   :', await text('p[role="alert"]'));
  await picker.setInputFiles({ name: 'huge.jpg', mimeType: 'image/jpeg', buffer: Buffer.alloc(11 * 1024 * 1024) });
  console.log('demo too large:', await text('p[role="alert"]'));
  // "broken.jpg" makes the browser log a decode error on purpose; anything else is a real problem.
  for (const p of problems.filter((p) => !/decode|could not be decoded/i.test(p))) fail(`/test/ demo ${p}`);
  await context.close();
}

// Browser vs. Python.
{
  const { context, page, problems } = await open('/selftest/', viewports[1]);
  await page.waitForSelector('[data-selftest]:not([data-selftest="running"])', { timeout: 300_000 });
  const status = await page.getAttribute('[data-selftest]', 'data-selftest');
  const rows = await page.locator('tr[data-model]').allInnerTexts();
  console.log(`selftest: ${status.toUpperCase()}`);
  for (const row of rows) console.log('  ' + row.replace(/\s+/g, ' '));
  if (status !== 'pass') fail(`/selftest/ status is ${status}`);
  for (const p of problems) fail(`/selftest/ ${p}`);
  await context.close();
}

// The phone suite, over the machine's LAN address when possible: a plain-http, non-localhost
// origin is not a secure context, which is how a phone reaches a dev or preview server.
{
  const lan = Object.values(networkInterfaces())
    .flat()
    .find((a) => a && a.family === 'IPv4' && !a.internal)?.address;
  let mobileBase = base;
  if (lan) {
    try {
      const probe = await fetch(`http://${lan}:${PORT}/`);
      if (probe.ok) mobileBase = `http://${lan}:${PORT}`;
    } catch {
      // not reachable through the LAN address (firewall); localhost still tests the same code
    }
  }

  const { defaultBrowserType, ...iphone } = devices['iPhone 11'];
  let phone = null;
  try {
    phone = { label: 'WebKit (iPhone 11 profile)', browser: await webkit.launch() };
  } catch (error) {
    const reason = String(error.message).split(/\r?\n/).filter(Boolean).slice(0, 4).join(' ');
    console.log(`\nWEBKIT SKIPPED: ${reason}`);
    if (args.includes('--require-webkit')) fail('WebKit is required but could not be launched');
    else console.log('Running the phone suite in Chromium with the iPhone 11 profile instead. This is NOT a Safari test.');
    phone = { label: 'Chromium (iPhone 11 profile, NOT WebKit)', browser };
  }
  await runMobileSuite({ ...phone, contextOptions: { ...iphone, locale: 'ar' }, base: mobileBase, fail });
  if (phone.browser !== browser) await phone.browser.close();
}

if (args.includes('--og')) {
  const { context, page } = await open('/art/og/', { width: 1200, height: 630 });
  await page.evaluate(() => document.fonts.ready);
  const out = fileURLToPath(new URL('../public/og.png', import.meta.url));
  writeFileSync(out, await page.locator('#plate').screenshot());
  console.log(`wrote ${out}`);
  await context.close();
}

await browser.close();
server.close();
console.log(failures.length ? `\n${failures.length} failure(s)` : '\nAll checks passed');
process.exit(failures.length ? 1 : 0);
