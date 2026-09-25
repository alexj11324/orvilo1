// Discover Linear team key by clicking sidebar
import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
await page.goto('https://linear.app/bdiverifier', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(5000);

// dump sidebar links
const links = await page.$$eval('a[href]', (as) =>
  as
    .map((a) => ({ href: a.getAttribute('href'), text: (a.textContent || '').trim().slice(0, 40) }))
    .filter((l) => l.href && l.href.includes('bdiverifier')),
);
console.log(JSON.stringify(links, null, 1));
process.exit(0);
