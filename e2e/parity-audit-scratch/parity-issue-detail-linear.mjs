// Audit Linear issue detail — enumerate controls, screenshot page + open menus.
import { chromium } from 'playwright';
import fs from 'node:fs';

const OUT = '/tmp/parity-audit-2026-09-23/issue-detail';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
await page.setViewportSize({ width: 1440, height: 900 });

// Step 1: team all-issues list to find a good issue row
await page.goto('https://linear.app/bdiverifier/team/ORV/all', {
  waitUntil: 'domcontentloaded',
  timeout: 30000,
});
await page.waitForTimeout(6000);
await page.screenshot({ path: `${OUT}/linear-00-team-all.png` });

// list rows with some metadata
const rows = await page.evaluate(() => {
  const anchors = [...document.querySelectorAll('a[href*="/issue/ORV-"]')];
  return anchors.slice(0, 40).map((a) => ({
    href: a.getAttribute('href'),
    text: (a.innerText || '').trim().slice(0, 90).replace(/\n/g, ' | '),
  }));
});
fs.writeFileSync(`${OUT}/linear-rows.json`, JSON.stringify(rows, null, 1));
fs.writeFileSync(`${OUT}/done-00.txt`, 'done ' + new Date().toISOString());
process.exit(0);
