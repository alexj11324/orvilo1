import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://localhost:9222');
const page = browser.contexts()[0].pages()[0];
// OTP boxes: usually 6 inputs or a single autofill input
const inputs = page.locator(
  'input[inputmode="numeric"], input[autocomplete="one-time-code"], input[maxlength="1"]',
);
const n = await inputs.count();
console.log('otp inputs:', n);
if (n >= 1) {
  await inputs.first().click();
  await page.keyboard.type('310348', { delay: 60 });
} else {
  const single = page.locator('input').first();
  await single.fill('310348');
}
await page.waitForTimeout(1000);
await page.screenshot({ path: '/tmp/devin-code-1.png' });
const btn = page.getByRole('button', { name: 'Continue' });
if (await btn.count()) await btn.click();
await page.waitForTimeout(6000);
await page.screenshot({ path: '/tmp/devin-code-2.png' });
console.log('URL:', page.url());
process.exit(0);
