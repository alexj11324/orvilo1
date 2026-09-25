import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://localhost:29229');
const ctx = browser.contexts()[0];
const page = ctx.pages()[0] ?? (await ctx.newPage());
await page.goto('http://localhost:3006', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);
console.log('URL:', page.url());
console.log('TITLE:', await page.title());
