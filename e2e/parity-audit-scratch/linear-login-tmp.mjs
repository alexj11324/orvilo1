import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages()[0] ?? (await ctx.newPage());
await page.waitForTimeout(2500);
console.log('URL:', page.url());
console.log('TITLE:', await page.title());
await page.screenshot({ path: '/tmp/linear-login.png' });
