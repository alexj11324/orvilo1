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

await page.goto('http://localhost:3010/agent-testing/views', {
  waitUntil: 'domcontentloaded',
  timeout: 60000,
});
await page.waitForTimeout(7000);
await shot('orvilo-views-dir');

const dom = await page.evaluate(() => {
  const els = [];
  const walk = (el, depth) => {
    if (depth > 16 || els.length > 600) return;
    const tag = el.tagName?.toLowerCase();
    const role = el.getAttribute?.('role');
    if (
      ['button', 'a', 'input', 'select', 'th'].includes(tag) ||
      ['tab', 'button', 'link', 'columnheader', 'tablist', 'switch', 'menuitem'].includes(role)
    ) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        els.push({
          tag,
          role,
          text: (
            el.innerText ||
            el.getAttribute('aria-label') ||
            el.getAttribute('title') ||
            el.getAttribute('placeholder') ||
            ''
          )
            .trim()
            .slice(0, 80),
          aria: el.getAttribute('aria-label'),
          href: el.getAttribute('href'),
          x: Math.round(r.x),
          y: Math.round(r.y),
          w: Math.round(r.width),
          h: Math.round(r.height),
        });
      }
    }
    for (const c of el.children || []) walk(c, depth + 1);
  };
  walk(document.body, 0);
  return {
    url: location.href,
    title: document.title,
    bodyText: document.body.innerText.slice(0, 800),
    elements: els,
  };
});
fs.writeFileSync(`${OUT}/orvilo-views-dir-dom.json`, JSON.stringify(dom, null, 2));
console.log('URL:', dom.url, '| TITLE:', dom.title, '| els:', dom.elements.length);
console.log('BODYTEXT:', dom.bodyText.slice(0, 400));
for (const e of dom.elements)
  console.log(
    `${e.tag} ${e.role || ''} x=${e.x} y=${e.y} ${e.aria || ''} | ${e.text.slice(0, 60)}`,
  );
await page.close();
await browser.close();
console.log('DONE');
