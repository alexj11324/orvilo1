import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
const reqs = [];
page.on('request', (r) => {
  const u = r.url();
  if (u.includes('trpc') || u.includes('webapi') || u.includes('api')) reqs.push(u.slice(0, 140));
});
page.on('pageerror', (e) => reqs.push(`[pageerror] ${String(e).slice(0, 200)}`));
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto('http://localhost:3010/agent-testing/inbox', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(25000);
console.log('URL:', page.url());
console.log('REQS:', JSON.stringify(reqs.slice(0, 50), null, 1));
const txt = await page.evaluate(() =>
  document.body.innerText.replace(/\n{2,}/g, '\n').slice(0, 1200),
);
console.log('TEXT:', txt);
await page.screenshot({ path: '/tmp/parity-inbox-evidence/orvilo-inbox-3.png' });
await page.close();
await browser.close();
