// Re-login to Orvilo :3010 — verbose, resilient.
import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://localhost:9222', { timeout: 120000 });
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
const log = (...a) => console.log(...a);

await page
  .goto('http://localhost:3010/signin', { waitUntil: 'domcontentloaded', timeout: 90000 })
  .catch((e) => log('goto warn', e.message));
await page.waitForTimeout(8000);
log('signin URL:', page.url(), '| TITLE:', await page.title());

const structure = await page.evaluate(() => {
  const inputs = [...document.querySelectorAll('input')].map((i) => ({
    type: i.type,
    name: i.name,
    ph: i.placeholder,
    vis: i.getBoundingClientRect().width > 0,
  }));
  const buttons = [...document.querySelectorAll('button')].map((b) => ({
    text: (b.textContent || '').trim().slice(0, 40),
    type: b.type,
    vis: b.getBoundingClientRect().width > 0,
  }));
  return { inputs, buttons };
});
log('SIGNIN STRUCTURE:', JSON.stringify(structure));

// email
const email = page.locator('input').first();
await email.click().catch(() => {});
await email.fill('agent-testing@orvilo.aspectlylabs.com');
await page.waitForTimeout(500);

// T&C checkbox — click the checkbox input or its label
const cb = page.locator('input[type="checkbox"]').first();
if (await cb.count()) {
  await cb.click({ force: true }).catch(async () => {
    await page
      .locator('text=/I have read and agree/i')
      .first()
      .click()
      .catch(() => {});
  });
  await page.waitForTimeout(600);
}
// agree-and-continue modal if present
const agree = page.getByRole('button', { name: /agree and continue/i });
if (
  (await agree.count()) &&
  (await agree
    .first()
    .isVisible()
    .catch(() => false))
) {
  await agree.first().click();
  await page.waitForTimeout(1000);
}

// click Next
const next = page
  .locator('button:has-text("Next"), button:has-text("下一步"), button:has-text("继续")')
  .first();
log('next count:', await next.count());
await next.click().catch((e) => log('next err', e.message));
await page.waitForTimeout(5000);
await page.screenshot({ path: '/tmp/parity-my-issues/login-2.png' });
log('after email URL:', page.url());

const structure2 = await page.evaluate(() => {
  const inputs = [...document.querySelectorAll('input')].map((i) => ({
    type: i.type,
    ph: i.placeholder,
    vis: i.getBoundingClientRect().width > 0,
  }));
  const buttons = [...document.querySelectorAll('button')].map((b) => ({
    text: (b.textContent || '').trim().slice(0, 40),
    vis: b.getBoundingClientRect().width > 0,
  }));
  return { inputs, buttons, body: document.body.innerText.slice(0, 200) };
});
log('STEP2:', JSON.stringify(structure2));

const pwd = page.locator('input[type="password"]').first();
if ((await pwd.count()) && (await pwd.isVisible().catch(() => false))) {
  await pwd.fill('TestPassword123!');
  const submit = page
    .locator(
      'button[type="submit"], button:has-text("Sign in"), button:has-text("Log in"), button:has-text("登录"), button:has-text("Next"), button:has-text("继续")',
    )
    .first();
  await submit.click().catch((e) => log('submit err', e.message));
  await page.waitForTimeout(9000);
}
await page.screenshot({ path: '/tmp/parity-my-issues/login-4.png' });
log('after password URL:', page.url());

await page
  .goto('http://localhost:3010/agent-testing/my-issues', {
    waitUntil: 'domcontentloaded',
    timeout: 90000,
  })
  .catch((e) => log('goto2 warn', e.message));
await page.waitForTimeout(12000);
log('final URL:', page.url(), '| TITLE:', await page.title());
log(
  'BODY:',
  (await page.evaluate(() => document.body.innerText.slice(0, 250))).replace(/\n/g, ' | '),
);
await page.close();
process.exit(0);
