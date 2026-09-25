import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text().slice(0, 200)}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${String(e).slice(0, 300)}`));
page.on('requestfailed', (r) =>
  logs.push(`[reqfail] ${r.url().slice(0, 120)} ${r.failure()?.errorText}`),
);
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto('http://localhost:3010/agent-testing/inbox', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(15000);
console.log('URL:', page.url());
console.log('LOGS:', JSON.stringify(logs.slice(0, 40), null, 1));
const html = await page.evaluate(() => document.body.innerHTML.slice(0, 800));
console.log('BODY:', html);
await page.close();
await browser.close();
