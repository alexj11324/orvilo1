// Re-login v2 — click T&C via text label, handle post-Next modal.
import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://localhost:9222', { timeout: 120000 });
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
const log = (...a) => console.log(...a);
const shot = (n) => page.screenshot({ path: `/tmp/parity-my-issues/${n}.png` });

await page
  .goto('http://localhost:3010/signin', { waitUntil: 'domcontentloaded', timeout: 90000 })
  .catch((e) => log('goto warn', e.message));
await page.waitForSelector('input', { timeout: 60000 });
await page.waitForTimeout(3000);
log('signin URL:', page.url());

// email
const email = page.locator('input[type="text"], input[name="email"], input[type="email"]').first();
await email.click();
await email.fill('agent-testing@orvilo.aspectlylabs.com');
await page.waitForTimeout(400);
log('email filled:', await email.inputValue());

// tick T&C: click the label text (antd checkbox listens on label wrapper)
const label = page.locator('text=/I have read and agree/i').first();
if (await label.count()) {
  await label.click().catch((e) => log('label click', e.message));
  await page.waitForTimeout(700);
}
// verify checkbox state
const cbState = await page.evaluate(() => {
  const cb = document.querySelector('input[type="checkbox"]');
  return cb
    ? { checked: cb.checked, ariaChecked: cb.getAttribute('aria-checked'), cls: cb.className }
    : null;
});
log('checkbox state:', JSON.stringify(cbState));

await shot('login-a-before-next');
// click Next
await page.locator('button[type="submit"], button:has-text("Next")').first().click();
await page.waitForTimeout(2500);
await shot('login-b-after-next');

// Agree-and-continue modal may appear now
const agree = page.getByRole('button', { name: /agree and continue/i });
if (
  (await agree.count()) &&
  (await agree
    .first()
    .isVisible()
    .catch(() => false))
) {
  log('agree modal -> click');
  await agree.first().click();
  await page.waitForTimeout(1500);
}

// maybe still need Next after modal
const pwd = page.locator('input[type="password"]');
if (
  !(await pwd.count()) ||
  !(await pwd
    .first()
    .isVisible()
    .catch(() => false))
) {
  const next2 = page.locator('button[type="submit"], button:has-text("Next")').first();
  if ((await next2.count()) && (await next2.isVisible().catch(() => false))) {
    await next2.click().catch(() => {});
    await page.waitForTimeout(3500);
  }
}
await shot('login-c-step2');
log('URL now:', page.url());
log('pwd fields:', await pwd.count());
const body = await page.evaluate(() => document.body.innerText.slice(0, 300));
log('BODY:', body.replace(/\n/g, ' | ').slice(0, 280));

if (
  (await pwd.count()) &&
  (await pwd
    .first()
    .isVisible()
    .catch(() => false))
) {
  await pwd.first().fill('TestPassword123!');
  await shot('login-d-pwd');
  const submit = page.locator('button[type="submit"]').first();
  await submit.click().catch((e) => log('submit', e.message));
  await page.waitForTimeout(10000);
}
log('after password URL:', page.url());
await shot('login-e-final');

await page
  .goto('http://localhost:3010/agent-testing/my-issues', { waitUntil: 'commit', timeout: 60000 })
  .catch((e) => log('goto2 warn', e.message));
await page.waitForTimeout(12000);
log('final URL:', page.url(), '| TITLE:', await page.title());
await page.close();
process.exit(0);
