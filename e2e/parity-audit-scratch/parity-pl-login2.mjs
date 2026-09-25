/* Careful Orvilo login, tolerant of slow nav. */
import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
await page.setViewportSize({ width: 1440, height: 900 });
try {
  await page.goto('http://localhost:3010/signin', { waitUntil: 'commit', timeout: 20000 });
} catch (e) {
  console.log('goto warn:', e.message);
}
await page.bringToFront().catch(() => {});
await page.waitForTimeout(7000);
console.log('url:', page.url());

const dumpState = async (tag) => {
  const st = await page.evaluate(() => {
    const els = [...document.querySelectorAll('input, button, [role="checkbox"], a')];
    return els
      .map((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0) return null;
        return `${el.tagName}[${el.type || el.getAttribute('role') || ''}] "${(el.getAttribute('aria-label') || el.innerText || el.placeholder || '').replace(/\s+/g, ' ').trim().slice(0, 60)}" @${Math.round(r.x)},${Math.round(r.y)} dis=${!!el.disabled} checked=${el.getAttribute('aria-checked') ?? el.checked ?? ''}`;
      })
      .filter(Boolean)
      .join('\n');
  });
  console.log(`\n=== ${tag} @ ${page.url()} ===\n${st}`);
};

await dumpState('initial');

const email = page
  .locator('input[type="email"], input[name="email"], input[placeholder*="mail" i]')
  .first();
if (await email.count()) {
  await email.fill('agent-testing@orvilo.aspectlylabs.com');
  await page.waitForTimeout(500);
  const cb = page.locator('[role="checkbox"], input[type="checkbox"]').first();
  if (await cb.count()) {
    const checked = await cb.getAttribute('aria-checked').catch(() => null);
    console.log('checkbox aria-checked:', checked);
    if (checked !== 'true') {
      await cb.click();
      await page.waitForTimeout(800);
    }
  }
  const agree = page.getByRole('button', { name: /agree and continue/i });
  if (await agree.count()) {
    console.log('agree modal visible, clicking');
    await agree.first().click();
    await page.waitForTimeout(1200);
  }
  await dumpState('after-email+checkbox');
  await page
    .getByRole('button', { name: /^next$|下一步|继续/i })
    .first()
    .click();
  await page.waitForTimeout(4000);
  await dumpState('after-next');
  const pwd = page.locator('input[type="password"]').first();
  if ((await pwd.count()) && (await pwd.isVisible().catch(() => false))) {
    await pwd.fill('TestPassword123!');
    await page.waitForTimeout(300);
    await page
      .getByRole('button', { name: /sign in|log in|登录|^next$|继续/i })
      .first()
      .click();
    await page.waitForTimeout(6000);
    await dumpState('after-signin');
  }
}
console.log('FINAL URL:', page.url());
await page.close();
await browser.close();
console.log('DONE');
