/* Audit: Linear projects list page — structure + interactive elements. */
import { chromium } from 'playwright';
import fs from 'node:fs';

const OUT = '/tmp/parity-audit-2026-09-23/projects-list';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
await page.setViewportSize({ width: 1440, height: 900 });

const url = process.argv[2] || 'https://linear.app/bdiverifier/projects/all';
console.log('goto', url);
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(6000);
await page.screenshot({ path: `${OUT}/linear-projects-all.png` });

// Dump the main content structure
const dump = await page.evaluate(() => {
  const main = document.querySelector('main') || document.body;
  const text = (el) => (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  const describe = (el, depth) => {
    if (depth > 6 || !el) return [];
    const rows = [];
    const tag = el.tagName?.toLowerCase();
    const role = el.getAttribute?.('role');
    const aria = el.getAttribute?.('aria-label');
    const cls = (el.className?.toString() || '').slice(0, 60);
    const t = el.children?.length === 0 ? text(el) : '';
    if (
      ['button', 'a', 'input', 'select'].includes(tag) ||
      role === 'button' ||
      role === 'columnheader' ||
      role === 'tab' ||
      aria
    ) {
      rows.push(
        `${'  '.repeat(depth)}<${tag}${role ? ` role=${role}` : ''}${aria ? ` aria="${aria}"` : ''}> ${t} [${cls}]`,
      );
    }
    for (const child of el.children || []) rows.push(...describe(child, depth + 1));
    return rows;
  };
  return describe(main, 0).join('\n');
});
fs.writeFileSync(`${OUT}/linear-interactive.txt`, dump);
console.log(dump.split('\n').slice(0, 120).join('\n'));
console.log('... total lines:', dump.split('\n').length);

// Full innerText of the list area for column headers etc.
const headerText = await page.evaluate(() => {
  const els = [...document.querySelectorAll('main *')].filter(
    (el) => el.children.length === 0 && el.innerText?.trim(),
  );
  return els
    .slice(0, 200)
    .map((el) => el.innerText.trim())
    .join(' | ');
});
fs.writeFileSync(`${OUT}/linear-texts.txt`, headerText);
console.log('TEXTS:', headerText.slice(0, 3000));

await page.close();
await browser.close();
