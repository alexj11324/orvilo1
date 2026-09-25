import { chromium } from 'playwright';
import fs from 'node:fs';
const OUTF =
  '/Users/devin/repos/wt-parity-views/.agents/runtime-acceptance/parity-2026-09-23/views/lin-display-probe.json';
const browser = await chromium.connectOverCDP('http://localhost:9222', { timeout: 120000 });
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
page.setDefaultTimeout(30000);
try {
  await page.goto('https://linear.app/bdiverifier/view/all-issues-3320169ce6ab', {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await page.waitForTimeout(9000);
  const btn = page.locator('button[aria-label="Display options"]').first();
  await btn.click({ timeout: 10000 });
  await page.waitForTimeout(1600);
  await page.screenshot({
    path: '/Users/devin/repos/wt-parity-views/.agents/runtime-acceptance/parity-2026-09-23/views/lin-display2.png',
  });
  // capture ANY overlay-ish element: fixed/absolute, high z, contains text
  const data = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(el);
      if (
        (cs.position === 'fixed' || cs.position === 'absolute') &&
        parseInt(cs.zIndex || '0') > 10
      ) {
        const r = el.getBoundingClientRect();
        const t = (el.innerText || '').trim();
        if (r.width > 60 && r.height > 60 && t.length > 10 && r.y < 800) {
          // only outermost containers
          if (out.some((o) => o.el === el)) continue;
          out.push({
            tag: el.tagName,
            role: el.getAttribute('role'),
            cls: (el.className || '').toString().slice(0, 80),
            x: Math.round(r.x),
            y: Math.round(r.y),
            w: Math.round(r.width),
            h: Math.round(r.height),
            z: cs.zIndex,
            text: t.slice(0, 3000),
          });
        }
      }
    }
    // dedupe nested: keep smallest containers covering same text
    return out;
  });
  fs.writeFileSync(OUTF, JSON.stringify(data, null, 1));
  // also dump interactive rows inside the overlay
  const rows = await page.evaluate(() => {
    const res = [];
    for (const el of document.querySelectorAll(
      '[role=option],[role=menuitem],[role=switch],[role=radio],[role=tab],button,[role=combobox],[role=listbox] *',
    )) {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (r.width > 0 && r.height > 0 && parseInt(cs.zIndex || '0') >= 0) {
        const t = (el.innerText || '').trim();
        if (t && r.x > 700 && r.y > 60 && r.y < 700)
          res.push({
            tag: el.tagName,
            role: el.getAttribute('role'),
            text: t.slice(0, 70),
            x: Math.round(r.x),
            y: Math.round(r.y),
            w: Math.round(r.width),
            h: Math.round(r.height),
          });
      }
    }
    return res.slice(0, 120);
  });
  fs.writeFileSync(OUTF.replace('.json', '-rows.json'), JSON.stringify(rows, null, 1));
} finally {
  await page.close();
  await browser.close();
}
