import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages()[0];
await page.getByRole('button', { name: 'Continue with email' }).click();
await page.waitForTimeout(3500);
await page.screenshot({ path: '/tmp/linear-4.png' });
console.log('URL:', page.url());
process.exit(0);
