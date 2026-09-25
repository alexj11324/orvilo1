// Stage A: pick an issue from the team list, land on it, inventory + screenshots.
import { chromium } from 'playwright';
import fs from 'node:fs';

const OUT = '/tmp/parity-audit-2026-09-23/issue-detail';
fs.mkdirSync(OUT, { recursive: true });
const log = (m) => fs.appendFileSync(`${OUT}/audit-log.txt`, `${new Date().toISOString()} ${m}\n`);

const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
await page.setViewportSize({ width: 1440, height: 900 });
log('tab opened');

try {
  await page.goto('https://linear.app/bdiverifier/team/ORV/all', {
    waitUntil: 'domcontentloaded',
    timeout: 45000,
  });
  await page.waitForTimeout(7000);
  await page.screenshot({ path: `${OUT}/linear-00-team-all.png` });
  log('team list captured');

  const rows = await page.evaluate(() => {
    const anchors = [...document.querySelectorAll('a[href*="/issue/ORV-"]')];
    const seen = new Map();
    for (const a of anchors) {
      const href = a.getAttribute('href');
      if (!seen.has(href))
        seen.set(href, (a.innerText || '').trim().slice(0, 100).replace(/\n/g, ' | '));
    }
    return [...seen.entries()].map(([href, text]) => ({ href, text }));
  });
  fs.writeFileSync(`${OUT}/linear-rows.json`, JSON.stringify(rows, null, 1));
  log(`rows: ${rows.length}`);
} catch (e) {
  log('ERR ' + e.message);
}
fs.writeFileSync(`${OUT}/done-01.txt`, 'done');
process.exit(0);
