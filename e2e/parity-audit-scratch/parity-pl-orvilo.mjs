/* Orvilo projects list — audit. Usage: node parity-pl-orvilo.mjs <baseUrl> <outPrefix> */
import { chromium } from 'playwright';
import fs from 'node:fs';

const OUT = '/tmp/parity-audit-2026-09-23/projects-list';
fs.mkdirSync(OUT, { recursive: true });
const base = process.argv[2] || 'http://localhost:3010';
const prefix = process.argv[3] || 'orvilo';
const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto(`${base}/agent-testing/projects`, { waitUntil: 'domcontentloaded' });
await page.bringToFront().catch(() => {});
await page.waitForTimeout(7000);
console.log('URL:', page.url(), 'TITLE:', await page.title());
await page.screenshot({ path: `${OUT}/${prefix}-projects.png` });

const info = await page.evaluate(() => {
  const controls = [];
  for (const el of document.querySelectorAll(
    'button, a[href], input, [role="button"], [role="combobox"], [role="tab"], [role="switch"]',
  )) {
    const r = el.getBoundingClientRect();
    controls.push({
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute('role'),
      label:
        el.getAttribute('aria-label') ||
        el.getAttribute('title') ||
        (el.innerText || el.value || el.placeholder || '').replace(/\s+/g, ' ').trim().slice(0, 70),
      x: Math.round(r.x),
      y: Math.round(r.y),
      w: Math.round(r.width),
      h: Math.round(r.height),
      href: el.getAttribute('href') || undefined,
      disabled: el.disabled || el.getAttribute('aria-disabled') || undefined,
    });
  }
  const main = document.querySelector('main') || document.body;
  return { controls, bodyText: main.innerText.slice(0, 3000) };
});
fs.writeFileSync(`${OUT}/${prefix}-controls.json`, JSON.stringify(info.controls, null, 2));
console.log('BODY TEXT:\n' + info.bodyText.replace(/\n/g, ' | ').slice(0, 2000));
console.log('\nCONTROLS (y<500):');
console.log(
  info.controls
    .filter((c) => c.y < 500 && c.w > 0)
    .map(
      (c) =>
        `${String(c.y).padStart(4)},${String(c.x).padStart(4)} ${c.tag}[${c.role || ''}] "${c.label}"${c.disabled ? ' DISABLED' : ''}${c.href ? ' ->' + c.href : ''}`,
    )
    .join('\n'),
);
await page.close();
await browser.close();
console.log('DONE');
