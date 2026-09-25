/* Linear projects list — resilient audit. */
import { chromium } from 'playwright';
import fs from 'node:fs';

const OUT = '/tmp/parity-audit-2026-09-23/projects-list';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto('https://linear.app/bdiverifier/projects/all', { waitUntil: 'domcontentloaded' });
await page.bringToFront().catch(() => {});
await page.waitForTimeout(7000);
console.log('URL:', page.url(), 'TITLE:', await page.title());

const info = await page.evaluate(() => {
  const all = document.querySelectorAll('*').length;
  const btns = document.querySelectorAll('button').length;
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const controls = [];
  for (const el of document.querySelectorAll(
    'button, a[href], input, [role="button"], [role="combobox"], [role="tab"]',
  )) {
    const r = el.getBoundingClientRect();
    controls.push({
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute('role'),
      label:
        el.getAttribute('aria-label') ||
        el.getAttribute('title') ||
        (el.innerText || el.value || '').replace(/\s+/g, ' ').trim().slice(0, 70),
      x: Math.round(r.x),
      y: Math.round(r.y),
      w: Math.round(r.width),
      h: Math.round(r.height),
      visible: vis(el),
    });
  }
  return { all, btns, controls, bodyText: document.body.innerText.slice(0, 500) };
});
console.log('elements:', info.all, 'buttons:', info.btns);
console.log('BODY:', info.bodyText.replace(/\n/g, ' | ').slice(0, 400));
fs.writeFileSync(`${OUT}/linear-controls.json`, JSON.stringify(info.controls, null, 2));
console.log(
  info.controls
    .filter((c) => c.y < 400)
    .map(
      (c) =>
        `${String(c.y).padStart(4)},${String(c.x).padStart(4)} ${c.tag} "${c.label}" vis=${c.visible}`,
    )
    .join('\n'),
);
await page.close();
await browser.close();
console.log('DONE');
