import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages()[0] ?? (await ctx.newPage());
await page.goto('https://linear.app/login', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(4000);
console.log('URL:', page.url());
await page.screenshot({ path: '/tmp/linear-1.png', fullPage: false });
