import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages()[0];
await page.getByRole('button', { name: 'Continue with email' }).click();
await page.waitForTimeout(2000);
await page.screenshot({ path: '/tmp/linear-2.png' });
const input = page
  .locator('input[type="email"], input[name="email"], input[placeholder*="email" i]')
  .first();
console.log('email input count:', await input.count());
await input.fill('alexjiang20232024@gmail.com');
await page.screenshot({ path: '/tmp/linear-3.png' });
