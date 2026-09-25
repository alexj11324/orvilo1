// Snapshot Orvilo task detail (known-broken page)
import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto('http://localhost:3010/agent-testing/task/PMI-1/urgent-review-release-evidence', {
  waitUntil: 'domcontentloaded',
});
await page.waitForTimeout(7000);
console.log('URL:', page.url(), '|', await page.title());
await page.screenshot({ path: '/tmp/orvilo-task-PMI-1.png' });
process.exit(0);
