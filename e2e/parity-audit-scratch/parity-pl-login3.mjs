/* Orvilo login — direct CDP input, no locators that can hang. */
import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
await page.setViewportSize({ width: 1440, height: 900 });
try {
  await page.goto('http://localhost:3010/signin', { waitUntil: 'commit', timeout: 15000 });
} catch {}
await page.bringToFront().catch(() => {});
await page.waitForTimeout(7000);
console.log('url:', page.url());

// click into the email field via coordinates, type, click Next via coordinates
const emailBox = await page.evaluate(() => {
  const el = [...document.querySelectorAll('input')].find(
    (i) => (i.placeholder || '').includes('mail') || i.type === 'email' || i.type === 'text',
  );
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
console.log('emailBox:', JSON.stringify(emailBox));
if (emailBox) {
  await page.mouse.click(emailBox.x, emailBox.y);
  await page.waitForTimeout(400);
  await page.keyboard.type('agent-testing@orvilo.aspectlylabs.com', { delay: 10 });
  await page.waitForTimeout(400);
}
const nextBox = await page.evaluate(() => {
  const el = [...document.querySelectorAll('button')].find((b) =>
    /^(next|下一步|继续)$/i.test((b.innerText || '').trim()),
  );
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2, disabled: el.disabled };
});
console.log('nextBox:', JSON.stringify(nextBox));
if (nextBox) {
  await page.mouse.click(nextBox.x, nextBox.y);
  await page.waitForTimeout(4500);
}
console.log('after next url:', page.url());
const pwdState = await page.evaluate(() => {
  const pwds = [...document.querySelectorAll('input[type="password"]')];
  const txt = document.body.innerText.slice(0, 400);
  const el = pwds[0];
  const r = el?.getBoundingClientRect();
  return {
    n: pwds.length,
    box: r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null,
    txt: txt.replace(/\n/g, ' | '),
  };
});
console.log('pwdState:', JSON.stringify(pwdState));
if (pwdState.box) {
  await page.mouse.click(pwdState.box.x, pwdState.box.y);
  await page.waitForTimeout(300);
  await page.keyboard.type('TestPassword123!', { delay: 10 });
  await page.waitForTimeout(300);
  const signBtn = await page.evaluate(() => {
    const el = [...document.querySelectorAll('button')].find(
      (b) =>
        b.type === 'submit' || /sign in|log in|登录|next|继续/i.test((b.innerText || '').trim()),
    );
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, label: el.innerText };
  });
  console.log('signBtn:', JSON.stringify(signBtn));
  if (signBtn) {
    await page.mouse.click(signBtn.x, signBtn.y);
    await page.waitForTimeout(7000);
  }
}
console.log('FINAL URL:', page.url());
await page.close();
await browser.close();
console.log('DONE');
