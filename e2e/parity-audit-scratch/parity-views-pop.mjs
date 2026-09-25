import { chromium } from 'playwright';
import fs from 'node:fs';
const OUT = '/tmp/parity-views';
const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
page.setDefaultTimeout(60000);

await page.goto('https://linear.app/bdiverifier/views/issues', {
  waitUntil: 'domcontentloaded',
  timeout: 60000,
});
await page.waitForTimeout(5000);

// capture all interactive/popup-ish elements AFTER clicking Display options
await page.locator('main button[aria-label="Display options"]').first().click({ timeout: 15000 });
await page.waitForTimeout(1500);
const after = await page.evaluate(() => {
  // grab every element with a bounding box inside a fixed/absolute container that looks like an overlay
  const items = [];
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.width < 10 || r.height < 10) continue;
    const style = getComputedStyle(el);
    if (style.position !== 'fixed' && style.position !== 'absolute') continue;
    const text = (el.innerText || '').trim();
    const tag = el.tagName.toLowerCase();
    if (['div', 'ul', 'li'].includes(tag) && text && text.length < 800 && r.y > 40) {
      items.push({
        tag,
        cls: (el.className || '').toString().slice(0, 60),
        x: Math.round(r.x),
        y: Math.round(r.y),
        w: Math.round(r.width),
        h: Math.round(r.height),
        text: text.slice(0, 300),
      });
    }
  }
  return items.slice(0, 40);
});
fs.writeFileSync(`${OUT}/linear-displayoptions-items.json`, JSON.stringify(after, null, 2));
console.log(
  'OVERLAY ITEMS:',
  JSON.stringify(
    after.map((i) => i.text.slice(0, 80)),
    null,
    1,
  ).slice(0, 3000),
);
await page.screenshot({ path: `${OUT}/linear-dir-displayoptions2.png` });
await page.keyboard.press('Escape');
await page.waitForTimeout(500);
await page.close();
await browser.close();
console.log('DONE');
