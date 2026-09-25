// Cycles audit — Linear cycles page detail (read-only).
import { chromium } from 'playwright';
import fs from 'node:fs';

const OUT = '/tmp/parity-cycles';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const page = await ctx.newPage();

await page.goto('https://linear.app/bdiverifier/team/ORV/cycles', {
  waitUntil: 'domcontentloaded',
});
await page.waitForTimeout(8000);
console.log('URL:', page.url(), '| TITLE:', await page.title());

// enumerate ALL interactive elements in main content area
const controls = await page.evaluate(() => {
  const main = document.querySelector('main') || document.body;
  const out = [];
  const sel =
    'button, a, [role="button"], [role="tab"], [role="link"], input, [tabindex="0"], [aria-haspopup]';
  for (const el of main.querySelectorAll(sel)) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    out.push({
      tag: el.tagName,
      role: el.getAttribute('role'),
      text: (el.innerText || el.getAttribute('aria-label') || '').trim().slice(0, 80),
      ariaLabel: el.getAttribute('aria-label'),
      href: el.tagName === 'A' ? el.getAttribute('href') : null,
      haspopup: el.getAttribute('aria-haspopup'),
      x: Math.round(r.x),
      y: Math.round(r.y),
    });
  }
  return out.slice(0, 60);
});
console.log('CYCLES-PAGE CONTROLS:', JSON.stringify(controls, null, 1));

// hover (not click) the sidebar Cycles row to read its tooltip
const cycRow = page.locator('span[aria-label="Enable cycles for team…"]').first();
if (await cycRow.count()) {
  await cycRow.hover();
  await page.waitForTimeout(1500);
  const tip = await page.evaluate(() => {
    const tips = [
      ...document.querySelectorAll('[role="tooltip"], .sx-tooltip, [class*="tooltip" i]'),
    ]
      .map((t) => (t.textContent || '').trim())
      .filter(Boolean);
    return tips;
  });
  console.log('SIDEBAR CYCLES TOOLTIP:', JSON.stringify(tip));
  await page.screenshot({ path: `${OUT}/linear-sidebar-cycles-hover.png` });
}

await page.screenshot({ path: `${OUT}/linear-cycles-page-full.png`, fullPage: true });
await page.close();
process.exit(0);
