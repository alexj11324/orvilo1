// Login v3: email → Next → T&C modal "Agree and continue" → password → sign in.
import { chromium } from 'playwright';
import fs from 'node:fs';
const OUT = '/tmp/parity-audit-2026-09-23/issue-detail';
const log = (m) => fs.appendFileSync(`${OUT}/audit-log.txt`, `${new Date().toISOString()} ${m}\n`);
const browser = await chromium.connectOverCDP('http://localhost:9222', { timeout: 120000 });
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
await page.setViewportSize({ width: 1440, height: 900 });
log('L3: tab');
try {
  await page.goto('http://localhost:3010/signin', {
    waitUntil: 'domcontentloaded',
    timeout: 120000,
  });
  await page.waitForTimeout(5000);

  // pre-modal (in case it opens on load)
  const preAgree = page.getByRole('button', { name: /agree and continue/i });
  if (
    (await preAgree.count()) &&
    (await preAgree
      .first()
      .isVisible()
      .catch(() => false))
  ) {
    await preAgree.first().click();
    await page.waitForTimeout(1000);
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
  await page.waitForTimeout(600);
  await page
    .getByRole('button', { name: /^next$/i })
    .first()
    .click();
  await page.waitForTimeout(2500);
  // T&C modal that appears after Next
  const agree = page.getByRole('button', { name: /agree and continue/i });
  if (
    (await agree.count()) &&
    (await agree
      .first()
      .isVisible()
      .catch(() => false))
  ) {
    await agree.first().click();
    await page.waitForTimeout(3500);
  }
  await page.screenshot({ path: `${OUT}/login2-after-agree.png` });
  log('L3: after agree ' + page.url());

  const pwd = page.locator('input[type="password"]').first();
  if ((await pwd.count()) && (await pwd.isVisible().catch(() => false))) {
    await pwd.click();
    await pwd.fill('TestPassword123!');
    await page
      .getByRole('button', { name: /sign in|log in|登录|^next$/i })
      .first()
      .click();
    await page.waitForTimeout(9000);
    log('L3: after pwd ' + page.url());
    await page.screenshot({ path: `${OUT}/login2-after-pwd.png` });
  } else {
    log('L3: still no password field');
    const btns = await page.evaluate(() =>
      [...document.querySelectorAll('button')]
        .filter((e) => e.getBoundingClientRect().width > 0)
        .map((e) => e.innerText.slice(0, 40)),
    );
    log('L3 btns: ' + JSON.stringify(btns.slice(0, 15)));
  }
  await page.goto('http://localhost:3010/agent-testing/tasks', {
    waitUntil: 'domcontentloaded',
    timeout: 120000,
  });
  await page.waitForTimeout(9000);
  await page.screenshot({ path: `${OUT}/orvilo-00-tasks.png` });
  const t = await page.evaluate(() => document.body.innerText.slice(0, 300));
  fs.writeFileSync(`${OUT}/orvilo-00-bodytext.txt`, t);
  log('L3: final ' + page.url());
} catch (e) {
  log('L3 ERR ' + e.message);
}
fs.writeFileSync(`${OUT}/done-08.txt`, 'done');
process.exit(0);
