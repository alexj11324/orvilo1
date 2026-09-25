import { chromium } from 'playwright';
import fs from 'fs';
const browser = await chromium.connectOverCDP('http://localhost:9222', { timeout: 90000 });
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
const log = [];
try {
  await page.goto('http://localhost:3010/agent-testing/project/prj_Pfyw7IcIBtsO', {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForTimeout(4000);
  log.push('url1: ' + page.url());
  if (page.url().includes('/signin')) {
    const email = page
      .locator(
        'input[type="email"], input[name="email"], input[placeholder*="email" i], input[placeholder*="Email" i]',
      )
      .first();
    await email.fill('agent-testing@orvilo.aspectlylabs.com');
    const cbLabel = page.locator('text=/I have read and agree/i').first();
    if (await cbLabel.count()) {
      await cbLabel.click().catch(() => {});
      await page.waitForTimeout(600);
    }
    const agree = page.getByRole('button', { name: /agree and continue/i });
    if (
      (await agree.count()) &&
      (await agree
        .first()
        .isVisible()
        .catch(() => false))
    ) {
      await agree.first().click();
      await page.waitForTimeout(800);
    }
    await page
      .getByRole('button', { name: /next|下一步|继续/i })
      .first()
      .click();
    await page.waitForTimeout(3500);
    const pwd = page.locator('input[type="password"]').first();
    if ((await pwd.count()) && (await pwd.isVisible().catch(() => false))) {
      await pwd.fill('TestPassword123!');
      await page
        .getByRole('button', { name: /sign in|log in|登录|next|继续/i })
        .first()
        .click();
      await page.waitForTimeout(6000);
    }
    log.push('url2: ' + page.url());
    await page.goto('http://localhost:3010/agent-testing/project/prj_Pfyw7IcIBtsO', {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForTimeout(5000);
    log.push('url3: ' + page.url());
  }
  await page.screenshot({ path: '/tmp/parity-project-detail/orvilo-after-login.png' });
} catch (e) {
  log.push('ERR ' + e.message);
}
fs.writeFileSync('/tmp/parity-project-detail/orvilo-login.log', log.join('\n'));
