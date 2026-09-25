import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://localhost:9222');
const page = browser.contexts()[0].pages()[0];
await page.getByRole('button', { name: 'Enter code manually' }).click();
await page.waitForTimeout(2500);
await page.screenshot({ path: '/tmp/linear-5.png' });
console.log('URL:', page.url());
process.exit(0);
