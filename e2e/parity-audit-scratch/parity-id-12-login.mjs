// Resilient login: retry CDP connect; email → Next → T&C modal → password → tasks.
import { chromium } from 'playwright';
import fs from 'node:fs';
const OUT = '/tmp/parity-audit-2026-09-23/issue-detail';
const log = (m) => {
  try {
    fs.appendFileSync(`${OUT}/audit-log.txt`, `${new Date().toISOString()} ${m}\n`);
  } catch {}
};

async function connect() {
  for (let i = 0; i < 10; i++) {
    try {
      return await chromium.connectOverCDP('http://localhost:9222', { timeout: 60000 });
    } catch (e) {
      log(`L4: connect ${i} fail`);
      await new Promise((r) => setTimeout(r, 20000));
    }
  }
  throw new Error('no CDP');
}
const browser = await connect();
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
await page.setViewportSize({ width: 1440, height: 900 });
log('L4: tab');
try {
  await page.goto('http://localhost:3010/agent-testing/task/APX-6', {
    waitUntil: 'domcontentloaded',
    timeout: 120000,
  });
  await page.waitForTimeout(10000);
  log('L4: landed ' + page.url());
  if (!page.url().includes('/signin')) {
    log('L4: already in');
    fs.writeFileSync(`${OUT}/done-12.txt`, 'ok');
    process.exit(0);
  }

  await page.screenshot({ path: `${OUT}/login3-s1.png` });
  const pre = page.getByRole('button', { name: /agree and continue/i });
  if (
    (await pre.count()) &&
    (await pre
      .first()
      .isVisible()
      .catch(() => false))
  ) {
    await pre.first().click();
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
  await page.waitForTimeout(600);
  await page
    .getByRole('button', { name: /^next$/i })
    .first()
    .click();
  await page.waitForTimeout(2500);
  const agree = page.getByRole('button', { name: /agree and continue/i });
  if (
    (await agree.count()) &&
    (await agree
      .first()
      .isVisible()
      .catch(() => false))
  ) {
    await agree.first().click();
    await page.waitForTimeout(4000);
  }
  await page.screenshot({ path: `${OUT}/login3-s3.png` });
  const pwd = page.locator('input[type="password"]').first();
  if ((await pwd.count()) && (await pwd.isVisible().catch(() => false))) {
    await pwd.click();
    await pwd.fill('TestPassword123!');
    await page
      .getByRole('button', { name: /sign in|log in|登录|^next$/i })
      .first()
      .click();
    await page.waitForTimeout(10000);
  } else {
    log(
      'L3v: no pwd; btns=' +
        JSON.stringify(
          await page.evaluate(() =>
            [...document.querySelectorAll('button')]
              .filter((e) => e.getBoundingClientRect().width > 0)
              .map((e) => e.innerText.slice(0, 40)),
          ),
        ),
    );
  }
  log('L4: after login ' + page.url());
  await page.goto('http://localhost:3010/agent-testing/task/APX-6', {
    waitUntil: 'domcontentloaded',
    timeout: 120000,
  });
  await page.waitForTimeout(12000);
  await page.screenshot({ path: `${OUT}/orvilo-10-detail-top.png` });
  log('L4: final ' + page.url());
} catch (e) {
  log('L4 ERR ' + e.message.split('\n')[0]);
}
fs.writeFileSync(`${OUT}/done-12.txt`, 'done');
process.exit(0);
