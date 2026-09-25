import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
await page.goto('chrome://settings/performance');
await page.waitForTimeout(2500);
console.log('opened settings tab');
process.exit(0);
