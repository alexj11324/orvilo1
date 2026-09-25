// Views parity audit — Linear reference side. Read-only.
// Usage: node e2e/parity-views-audit.mjs <outdir> [step]
import { chromium } from 'playwright';
import fs from 'node:fs';

const OUT = process.argv[2] || '/tmp/parity-views';
const STEP = process.argv[3] || 'all';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
page.setDefaultTimeout(15000);

const shot = async (name) => {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log('shot:', name);
};
const dump = async (name, fn) => {
  try {
    const data = await page.evaluate(fn);
    fs.writeFileSync(`${OUT}/${name}.json`, JSON.stringify(data, null, 2));
    console.log('dump:', name, JSON.stringify(data).slice(0, 400));
  } catch (e) {
    console.log('dump FAIL:', name, e.message);
  }
};

try {
  if (STEP === 'all' || STEP === 'dir') {
    await page.goto('https://linear.app/bdiverifier/views/issues', {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForTimeout(5000);
    await shot('linear-views-dir-issues');

    // Inventory the toolbar/tab strip and any buttons
    await dump('linear-views-dir-dom', () => {
      const main = document.querySelector('main') || document.body;
      const texts = [];
      const walk = (el, depth) => {
        if (depth > 14 || texts.length > 400) return;
        const role = el.getAttribute?.('role');
        const tag = el.tagName?.toLowerCase();
        if (
          ['button', 'a', 'input', '[role=tab]', '[role=columnheader]'].includes(tag) ||
          role === 'tab' ||
          role === 'button' ||
          role === 'link' ||
          role === 'columnheader' ||
          role === 'tablist'
        ) {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.height > 0) {
            texts.push({
              tag,
              role,
              text: (
                el.innerText ||
                el.getAttribute('aria-label') ||
                el.getAttribute('title') ||
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
      walk(main, 0);
      return { url: location.href, title: document.title, elements: texts };
    });
  }

  if (STEP === 'all' || STEP === 'rowmenu') {
    // find a view row ⋯ button — hover first row
    const rows = page.locator('main a[href*="/view/"]');
    const n = await rows.count();
    console.log('view rows:', n);
    if (n > 0) {
      const first = rows.first();
      await first.hover();
      await page.waitForTimeout(800);
      await shot('linear-views-row-hover');
      // look for an ellipsis button in the row
      const rowHtml = await first.evaluate((el) => el.outerHTML.slice(0, 3000));
      fs.writeFileSync(`${OUT}/linear-view-row.html`, rowHtml);
    }
  }

  if (STEP === 'all' || STEP === 'newview') {
    // Open New view dialog, inspect, cancel
    const btn = page
      .locator('main button:has-text("New view"), main button:has-text("Add view")')
      .first();
    if (await btn.count()) {
      await btn.click();
      await page.waitForTimeout(1500);
      await shot('linear-newview-dialog');
      await dump('linear-newview-dom', () => {
        const dlg = document.querySelector('[role=dialog]') || document.body;
        return { text: dlg.innerText.slice(0, 3000) };
      });
      await page.keyboard.press('Escape');
      await page.waitForTimeout(600);
    } else {
      console.log('no New view button found');
    }
  }
} finally {
  await page.close();
  await browser.close();
}
console.log('DONE');
