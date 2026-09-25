// Discover Orvilo URL map from sidebar
import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => p.url().includes('localhost:3010')) || (await ctx.newPage());
await page.goto('http://localhost:3010/agent-testing/tasks', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(5000);
const links = await page.$$eval('a[href]', (as) =>
  as
    .map((a) => ({ href: a.getAttribute('href'), text: (a.textContent || '').trim().slice(0, 50) }))
    .filter((l) => l.href && l.href.length > 1),
);
console.log(JSON.stringify(links, null, 1));
process.exit(0);
