import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto('http://localhost:3010/signin', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(4000);
const agree = page.getByRole('button', { name: /agree and continue/i });
if (await agree.count()) {
  await agree
    .first()
    .click()
    .catch(() => {});
  await page.waitForTimeout(1000);
}
const email = page
  .locator('input[type="email"], input[name="email"], input[placeholder*="email" i]')
  .first();
await email.fill('agent-testing@orvilo.aspectlylabs.com');
const cbLabel = page.locator('text=/I have read and agree/i').first();
if (await cbLabel.count()) {
  await cbLabel.click().catch(() => {});
  await page.waitForTimeout(800);
}
const agree2 = page.getByRole('button', { name: /agree and continue/i });
if (
  (await agree2.count()) &&
  (await agree2
    .first()
    .isVisible()
    .catch(() => false))
) {
  await agree2.first().click();
  await page.waitForTimeout(800);
}
await page
  .getByRole('button', { name: /next|下一步|继续/i })
  .first()
  .click();
await page.waitForTimeout(4000);
console.log('after email URL:', page.url());
const pwd = page.locator('input[type="password"]').first();
if ((await pwd.count()) && (await pwd.isVisible().catch(() => false))) {
  await pwd.fill('TestPassword123!');
  await page
    .getByRole('button', { name: /sign in|log in|登录|next|继续/i })
    .first()
    .click();
  await page.waitForTimeout(7000);
}
console.log('after password URL:', page.url());
await page.goto('http://localhost:3010/agent-testing/inbox', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(9000);
console.log('final URL:', page.url());
await page.screenshot({ path: '/tmp/parity-inbox-evidence/orvilo-inbox-logged.png' });
const txt = await page.evaluate(() =>
  document.body.innerText.replace(/\n{2,}/g, '\n').slice(0, 1500),
);
console.log('TEXT:', txt);
await page.close();
await browser.close();
