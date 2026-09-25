/* Quick auth-state check + optional URL audit. args: url outfile-prefix */
import { chromium } from 'playwright';
import fs from 'node:fs';
const OUT = '/tmp/parity-audit-2026-09-23/projects-list';
fs.mkdirSync(OUT, { recursive: true });
const url = process.argv[2] || 'http://localhost:3010/agent-testing/projects';
const prefix = process.argv[3] || 'orvilo';
const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
await page.setViewportSize({ width: 1440, height: 900 });
try {
  await page.goto(url, { waitUntil: 'commit', timeout: 20000 });
} catch (e) {
  console.log('goto warn');
}
await page.bringToFront().catch(() => {});
await page.waitForTimeout(8000);
console.log('URL:', page.url());
const t = await page.evaluate(() => document.body.innerText.slice(0, 2500));
console.log(t.replace(/\n/g, ' | ').slice(0, 1500));
await page.screenshot({ path: `${OUT}/${prefix}-state.png` });
await page.close();
await browser.close();
console.log('DONE');
