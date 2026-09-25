// Own-tab Orvilo login (fresh page only — never touches other agents' tabs).
import { chromium } from 'playwright';
import fs from 'node:fs';

const OUT = '/tmp/parity-audit-2026-09-23/issue-detail';
const log = (m) => fs.appendFileSync(`${OUT}/audit-log.txt`, `${new Date().toISOString()} ${m}\n`);

const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
await page.setViewportSize({ width: 1440, height: 900 });
log('LOGIN: tab opened');

try {
  await page.goto('http://localhost:3010/agent-testing/tasks', {
    waitUntil: 'domcontentloaded',
    timeout: 45000,
  });
  await page.waitForTimeout(6000);
  log('LOGIN: at ' + page.url());
  if (!page.url().includes('/signin')) {
    log('LOGIN: already authenticated');
    fs.writeFileSync(`${OUT}/done-05.txt`, 'done-ok');
    process.exit(0);
  }
  await page.screenshot({ path: `${OUT}/orvilo-signin.png` });
  const agree = page.getByRole('button', { name: /agree and continue/i });
  if (await agree.count()) {
    await agree.first().click();
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
  log('LOGIN: after ' + page.url());
  await page.goto('http://localhost:3010/agent-testing/tasks', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);
  log('LOGIN: final ' + page.url());
  await page.screenshot({ path: `${OUT}/orvilo-00-tasks.png` });
} catch (e) {
  log('LOGIN ERR ' + e.message);
}
fs.writeFileSync(`${OUT}/done-05.txt`, 'done');
process.exit(0);
