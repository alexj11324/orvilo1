import { chromium } from 'playwright';
import fs from 'node:fs';
const OUTF = process.argv[2];
const browser = await chromium.connectOverCDP('http://localhost:9222', { timeout: 120000 });
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
try {
  await page.goto('https://linear.app/bdiverifier/views/issues', {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await page.waitForTimeout(8000);
  const data = await page.evaluate(() => {
    const main = document.querySelector('main') || document.body;
    const hits = [];
    for (const el of main.querySelectorAll('a,button,div,span')) {
      const t = (el.innerText || '').trim();
      if (t === 'Issues' || t === 'Projects' || t === 'Views') {
        const r = el.getBoundingClientRect();
        if (r.width > 0)
          hits.push({
            tag: el.tagName,
            cls: (el.className || '').toString().slice(0, 60),
            href: el.getAttribute('href'),
            role: el.getAttribute('role'),
            x: Math.round(r.x),
            y: Math.round(r.y),
            w: Math.round(r.width),
            h: Math.round(r.height),
          });
      }
    }
    const strip = [];
    for (const el of main.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (
        r.y > 45 &&
        r.y < 100 &&
        r.height > 10 &&
        r.height < 50 &&
        el.children.length === 0 &&
        (el.innerText || '').trim()
      ) {
        strip.push({
          tag: el.tagName,
          text: el.innerText.trim().slice(0, 40),
          x: Math.round(r.x),
          y: Math.round(r.y),
        });
      }
    }
    return { hits, strip, head: main.innerText.slice(0, 400) };
  });
  fs.writeFileSync(OUTF, JSON.stringify(data, null, 1));
} finally {
  await page.close();
  await browser.close();
}
