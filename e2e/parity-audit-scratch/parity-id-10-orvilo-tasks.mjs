// List Orvilo task rows (any link/card pointing at a task detail).
import { chromium } from 'playwright';
import fs from 'node:fs';
const OUT = '/tmp/parity-audit-2026-09-23/issue-detail';
const log = (m) => fs.appendFileSync(`${OUT}/audit-log.txt`, `${new Date().toISOString()} ${m}\n`);
const browser = await chromium.connectOverCDP('http://localhost:9222', { timeout: 120000 });
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
await page.setViewportSize({ width: 1440, height: 900 });
log('O2: tab');
try {
  await page.goto('http://localhost:3010/agent-testing/tasks', {
    waitUntil: 'domcontentloaded',
    timeout: 120000,
  });
  await page.waitForTimeout(12000);
  await page.screenshot({ path: `${OUT}/orvilo-00-tasks.png` });
  const rows = await page.evaluate(() => {
    const out = [];
    for (const a of document.querySelectorAll('a[href]')) {
      const h = a.getAttribute('href') || '';
      if (/task\//.test(h))
        out.push({ href: h, text: (a.innerText || '').trim().slice(0, 110).replace(/\n/g, ' | ') });
    }
    // also any element with identifier-ish text
    const ids = [...document.querySelectorAll('*')]
      .filter(
        (e) => /PARITY-\d+|PMI-\d+|TEST-\d+/.test(e.textContent || '') && e.children.length < 4,
      )
      .slice(0, 30)
      .map((e) => e.textContent.trim().slice(0, 80));
    return { links: out, ids };
  });
  fs.writeFileSync(`${OUT}/orvilo-task-rows.json`, JSON.stringify(rows, null, 1));
  log('O2: ' + JSON.stringify(rows.links.length) + ' links, ids=' + rows.ids.length);
} catch (e) {
  log('O2 ERR ' + e.message);
}
fs.writeFileSync(`${OUT}/done-10.txt`, 'done');
process.exit(0);
