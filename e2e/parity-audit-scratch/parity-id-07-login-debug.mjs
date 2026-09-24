// Step-by-step login with screenshots at each stage.
import { chromium } from 'playwright';
import fs from 'node:fs';
const OUT = '/tmp/parity-audit-2026-09-23/issue-detail';
const log = (m) => fs.appendFileSync(`${OUT}/audit-log.txt`, `${new Date().toISOString()} ${m}\n`);
const browser = await chromium.connectOverCDP('http://localhost:9222', { timeout: 120000 });
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
await page.setViewportSize({ width: 1440, height: 900 });
log('L2: tab');
try {
  await page.goto('http://localhost:3010/signin', {
    waitUntil: 'domcontentloaded',
    timeout: 45000,
  });
  await page.waitForTimeout(5000);
  await page.screenshot({ path: `${OUT}/login-s1.png` });
  log('L2: s1 ' + page.url());

  const agree = page.getByRole('button', { name: /agree and continue/i });
  if (
    (await agree.count()) &&
    (await agree
      .first()
      .isVisible()
      .catch(() => false))
  ) {
    await agree.first().click();
    await page.waitForTimeout(1200);
  }
  const email = page
    .locator('input[type="email"], input[name="email"], input[placeholder*="email" i]')
    .first();
  await email.click();
  await email.fill('agent-testing@orvilo.aspectlylabs.com');
  const cb = page.locator('text=/I have read and agree/i').first();
  if (await cb.count()) {
    await cb.click().catch(() => {});
  }
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/login-s2.png` });
  // there may be a second agree modal
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
  const nextBtn = page.getByRole('button', { name: /next|下一步|继续/i }).first();
  await nextBtn.click();
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${OUT}/login-s3.png` });
  log('L2: s3 ' + page.url());

  const pwd = page.locator('input[type="password"]').first();
  if ((await pwd.count()) && (await pwd.isVisible().catch(() => false))) {
    await pwd.click();
    await pwd.fill('TestPassword123!');
    await page.screenshot({ path: `${OUT}/login-s4.png` });
    const signBtn = page.getByRole('button', { name: /sign in|log in|登录|next|继续/i }).first();
    await signBtn.click();
    await page.waitForTimeout(8000);
    await page.screenshot({ path: `${OUT}/login-s5.png` });
    log('L2: s5 ' + page.url());
  } else {
    log('L2: no password field');
    // dump visible buttons
    const btns = await page.evaluate(() =>
      [...document.querySelectorAll('button, input')]
        .filter((e) => e.getBoundingClientRect().width > 0)
        .map((e) => (e.innerText || e.placeholder || e.type || '').slice(0, 50)),
    );
    log('L2 btns: ' + JSON.stringify(btns.slice(0, 20)));
  }
  await page.goto('http://localhost:3010/agent-testing/tasks', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(8000);
  await page.screenshot({ path: `${OUT}/orvilo-00-tasks.png` });
  log('L2: final ' + page.url());
  const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 400));
  fs.writeFileSync(`${OUT}/orvilo-00-bodytext.txt`, bodyText);
} catch (e) {
  log('L2 ERR ' + e.message);
}
fs.writeFileSync(`${OUT}/done-07.txt`, 'done');
process.exit(0);
