// Orvilo stage A: list tasks on :3010, pick a populated one, land on detail.
import { chromium } from 'playwright';
import fs from 'node:fs';

const OUT = '/tmp/parity-audit-2026-09-23/issue-detail';
const log = (m) => fs.appendFileSync(`${OUT}/audit-log.txt`, `${new Date().toISOString()} ${m}\n`);
const BASE = process.env.ORVILO_BASE || 'http://localhost:3010';

const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
await page.setViewportSize({ width: 1440, height: 900 });
log('O-A: tab opened ' + BASE);

try {
  await page.goto(`${BASE}/agent-testing/tasks`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(8000);
  await page.screenshot({ path: `${OUT}/orvilo-00-tasks.png` });
  log('O-A: tasks page ' + page.url());

  const rows = await page.evaluate(() => {
    const anchors = [...document.querySelectorAll('a[href*="/task/"]')];
    const seen = new Map();
    for (const a of anchors) {
      const href = a.getAttribute('href');
      if (!seen.has(href))
        seen.set(href, (a.innerText || '').trim().slice(0, 110).replace(/\n/g, ' | '));
    }
    return [...seen.entries()].map(([href, text]) => ({ href, text }));
  });
  fs.writeFileSync(`${OUT}/orvilo-task-rows.json`, JSON.stringify(rows, null, 1));
  log(`O-A: task rows=${rows.length}`);
} catch (e) {
  log('O-A ERR ' + e.message);
}
fs.writeFileSync(`${OUT}/done-04.txt`, 'done');
process.exit(0);
