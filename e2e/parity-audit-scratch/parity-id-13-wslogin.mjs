// Direct-ws CDP connect (bypasses wedged /json/version) → login → audit APX-6.
import { chromium } from 'playwright';
import fs from 'node:fs';
const OUT = '/tmp/parity-audit-2026-09-23/issue-detail';
const log = (m) => {
  try {
    fs.appendFileSync(`${OUT}/audit-log.txt`, `${new Date().toISOString()} ${m}\n`);
  } catch {}
};
const WS = 'ws://127.0.0.1:9222/devtools/browser/ecf8ca89-0876-46fe-b320-d58cc7c48364';

let browser;
for (let i = 0; i < 10; i++) {
  try {
    browser = await chromium.connectOverCDP(WS, { timeout: 60000 });
    break;
  } catch (e) {
    log(`W: connect ${i} fail ${e.message.split('\n')[0]}`);
    await new Promise((r) => setTimeout(r, 15000));
  }
}
if (!browser) {
  log('W: gave up');
  fs.writeFileSync(`${OUT}/done-13.txt`, 'no-cdp');
  process.exit(1);
}
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
await page.setViewportSize({ width: 1440, height: 900 });
log('W: tab');
try {
  await page.goto('http://localhost:3010/agent-testing/task/APX-6', {
    waitUntil: 'domcontentloaded',
    timeout: 120000,
  });
  await page.waitForTimeout(10000);
  log('W: landed ' + page.url());
  if (page.url().includes('/signin')) {
    await page.screenshot({ path: `${OUT}/login4-s1.png` });
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
    await page.waitForTimeout(3000);
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
    const pwd = page.locator('input[type="password"]').first();
    if ((await pwd.count()) && (await pwd.isVisible().catch(() => false))) {
      await pwd.click();
      await pwd.fill('TestPassword123!');
      await page
        .getByRole('button', { name: /sign in|log in|登录|^next$/i })
        .first()
        .click();
      await page.waitForTimeout(10000);
      log('W: after pwd ' + page.url());
    } else {
      log(
        'W: no pwd; btns=' +
          JSON.stringify(
            await page.evaluate(() =>
              [...document.querySelectorAll('button')]
                .filter((e) => e.getBoundingClientRect().width > 0)
                .map((e) => e.innerText.slice(0, 40)),
            ),
          ),
      );
    }
    await page.goto('http://localhost:3010/agent-testing/task/APX-6', {
      waitUntil: 'domcontentloaded',
      timeout: 120000,
    });
    await page.waitForTimeout(12000);
  }
  await page.screenshot({ path: `${OUT}/orvilo-10-detail-top.png` });
  log('W: final ' + page.url());
} catch (e) {
  log('W ERR ' + e.message.split('\n')[0]);
}
fs.writeFileSync(`${OUT}/done-13.txt`, 'done');
process.exit(0);
