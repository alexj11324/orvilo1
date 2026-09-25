import { chromium } from 'playwright';
import fs from 'node:fs';
const OUT = '/tmp/parity-views';
const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
page.setDefaultTimeout(60000);
const shot = async (n) => {
  await page.screenshot({ path: `${OUT}/${n}.png` });
  console.log('shot:', n);
};

await page.goto('https://linear.app/bdiverifier/views/issues', {
  waitUntil: 'domcontentloaded',
  timeout: 60000,
});
// wait for row link specifically
try {
  await page.waitForSelector('a[href*="/view/"]', { timeout: 30000 });
} catch {
  console.log('no view link after 30s');
}
const href = await page.evaluate(() =>
  document.querySelector('a[href*="/view/"]')?.getAttribute('href'),
);
console.log('view href:', href);
if (!href) {
  await shot('linear-views-noview');
  await page.close();
  await browser.close();
  process.exit(1);
}
await page.goto('https://linear.app' + href, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(7000);
await shot('linear-view-detail');

const dom = await page.evaluate(() => {
  const els = [];
  for (const el of document.querySelectorAll('button, a[href], input, [role=tab], [role=button]')) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && r.y < 200) {
      els.push({
        tag: el.tagName.toLowerCase(),
        aria: el.getAttribute('aria-label'),
        role: el.getAttribute('role'),
        text: (el.innerText || '').trim().slice(0, 60),
        x: Math.round(r.x),
        y: Math.round(r.y),
        w: Math.round(r.width),
        h: Math.round(r.height),
      });
    }
  }
  return { url: location.href, title: document.title, els };
});
fs.writeFileSync(`${OUT}/linear-view-detail-dom.json`, JSON.stringify(dom, null, 2));
console.log('URL:', dom.url, 'TITLE:', dom.title, 'els:', dom.els.length);
for (const e of dom.els)
  console.log(
    `${e.tag} x=${e.x} y=${e.y} w=${e.w} h=${e.h} ${e.aria || e.role || ''} | ${e.text.slice(0, 50)}`,
  );
await page.close();
await browser.close();
console.log('DONE');
