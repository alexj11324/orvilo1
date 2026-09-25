// Login debug — inspect button states and step transitions.
import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://localhost:9222', { timeout: 300000 });
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

await page
  .goto('http://localhost:3010/signin', { waitUntil: 'domcontentloaded', timeout: 90000 })
  .catch((e) => log('goto', e.message));
await page.waitForSelector('input', { timeout: 60000 });
await page.waitForTimeout(2000);

const inspect = async (tag) => {
  const s = await page.evaluate(() => ({
    url: location.href,
    inputs: [...document.querySelectorAll('input')].map((i) => ({
      t: i.type,
      ph: i.placeholder,
      val: i.value.slice(0, 40),
      checked: i.checked,
      disabled: i.disabled,
    })),
    buttons: [...document.querySelectorAll('button')].map((b) => ({
      text: (b.textContent || '').trim().slice(0, 40),
      disabled: b.disabled,
      ariaDisabled: b.getAttribute('aria-disabled'),
    })),
    errors: [...document.querySelectorAll('[class*="error" i], [role="alert"]')].map((e) =>
      (e.textContent || '').trim().slice(0, 80),
    ),
  }));
  log(tag, JSON.stringify(s));
};
await inspect('INITIAL');

const email = page.locator('input[type="text"], input[type="email"]').first();
await email.click();
await email.fill('agent-testing@orvilo.aspectlylabs.com');
await page.waitForTimeout(400);
await inspect('AFTER-EMAIL');

// click the checkbox LABEL wrapper (antd): try several targets
const tried = await page.evaluate(() => {
  const cb = document.querySelector('input[type="checkbox"]');
  if (!cb) return 'no-checkbox';
  const label = cb.closest('label') || cb.parentElement;
  label.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  return { checked: cb.checked };
});
log('after dispatch label click:', JSON.stringify(tried));
await page.waitForTimeout(500);
await inspect('AFTER-CB');

// If still unchecked, use playwright click on label text
if (!tried?.checked) {
  await page
    .locator('text=/I have read and agree/i')
    .first()
    .click()
    .catch(() => {});
  await page.waitForTimeout(500);
  await inspect('AFTER-CB2');
}

// click Next via real mouse
const next = page.locator('button[type="submit"], button:has-text("Next")').first();
const nb = await next.boundingBox();
log('next box', JSON.stringify(nb));
await page.mouse.click(nb.x + nb.width / 2, nb.y + nb.height / 2);
await page.waitForTimeout(3500);
await inspect('AFTER-NEXT');
await page.screenshot({ path: '/tmp/parity-my-issues/login-next.png' });

// modal?
const agree = page.getByRole('button', { name: /agree and continue/i });
log('agree count:', await agree.count());
if (
  (await agree.count()) &&
  (await agree
    .first()
    .isVisible()
    .catch(() => false))
) {
  await agree.first().click();
  await page.waitForTimeout(2000);
  await inspect('AFTER-AGREE');
}
// password?
const pwd = page.locator('input[type="password"]').first();
log('pwd count:', await pwd.count());
if (await pwd.count()) {
  await pwd.fill('TestPassword123!');
  const sub = page.locator('button[type="submit"]').first();
  const sb = await sub.boundingBox();
  if (sb) await page.mouse.click(sb.x + sb.width / 2, sb.y + sb.height / 2);
  await page.waitForTimeout(9000);
  await inspect('AFTER-PWD');
}
log('FINAL:', page.url());
await page.close();
process.exit(0);
