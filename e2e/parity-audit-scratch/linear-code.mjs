import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://localhost:9222');
const page = browser.contexts()[0].pages()[0];
await page.screenshot({ path: '/tmp/linear-5.png' });
console.log('URL:', page.url());
const inp = page.locator('input').first();
console.log('inputs:', await page.locator('input').count());
process.exit(0);
