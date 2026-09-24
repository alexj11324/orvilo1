import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://localhost:9222');
const page = browser.contexts()[0].pages()[0];
const inp = page.locator('input').first();
await inp.click();
await inp.fill('38JHBX3NE5');
await page.screenshot({ path: '/tmp/linear-6.png' });
// submit — either auto-submits on fill or click the button
const btn = page
  .locator('button[type="submit"], button:has-text("Continue"), button:has-text("Log in")')
  .first();
if (await btn.count()) {
  await btn.click();
}
await page.waitForTimeout(5000);
await page.screenshot({ path: '/tmp/linear-7.png' });
console.log('URL:', page.url());
process.exit(0);
