import { connect } from './lib.mjs';
import fs from 'fs';
const { browser, page } = await connect();
const EV = '/tmp/parity-inbox-evidence';
const shot = (n) => page.screenshot({ path: `${EV}/${n}.png` });

// --- login ---
await page
  .goto('http://localhost:3010/signin', { waitUntil: 'domcontentloaded', timeout: 90000 })
  .catch((e) => console.log('goto signin err', e.message));
await page.waitForTimeout(5000);
if (page.url().includes('/signin')) {
  const agree = page.getByRole('button', { name: /agree and continue/i });
  if (await agree.count()) {
    await agree
      .first()
      .click()
      .catch(() => {});
    await page.waitForTimeout(1000);
  }
  const email = page
    .locator('input[type="email"], input[name="email"], input[placeholder*="email" i]')
    .first();
  await email.fill('agent-testing@orvilo.aspectlylabs.com').catch(() => {});
  const cbLabel = page.locator('text=/I have read and agree/i').first();
  if (await cbLabel.count()) {
    await cbLabel.click().catch(() => {});
    await page.waitForTimeout(900);
  }
  const agree2 = page.getByRole('button', { name: /agree and continue/i });
  if (
    (await agree2.count()) &&
    (await agree2
      .first()
      .isVisible()
      .catch(() => false))
  ) {
    await agree2
      .first()
      .click()
      .catch(() => {});
    await page.waitForTimeout(900);
  }
  await page
    .getByRole('button', { name: /next|下一步|继续/i })
    .first()
    .click()
    .catch(() => {});
  await page.waitForTimeout(5000);
  const pwd = page.locator('input[type="password"]').first();
  if ((await pwd.count()) && (await pwd.isVisible().catch(() => false))) {
    await pwd.fill('TestPassword123!');
    await page
      .getByRole('button', { name: /sign in|log in|登录|next|继续/i })
      .first()
      .click()
      .catch(() => {});
    await page.waitForTimeout(8000);
  }
  console.log('post-login URL:', page.url());
}
await page
  .goto('http://localhost:3010/agent-testing/inbox', {
    waitUntil: 'domcontentloaded',
    timeout: 90000,
  })
  .catch((e) => console.log('goto inbox err', e.message));
// wait for rows or empty state
for (let i = 0; i < 15; i++) {
  await page.waitForTimeout(2000);
  const st = await page
    .evaluate(() => ({
      url: location.href,
      rows: document.querySelectorAll('[data-inbox-id]').length,
      text: document.body.innerText.slice(0, 120),
    }))
    .catch(() => ({ err: 1 }));
  if (st.url && st.url.includes('signin')) {
    console.log('BOUNCED TO SIGNIN');
    break;
  }
  if (
    st.rows > 0 ||
    (st.text &&
      (st.text.includes('notification') ||
        st.text.includes('No notifications') ||
        st.text.includes('unread')))
  ) {
    console.log(`loaded t=${(i + 1) * 2}s rows=${st.rows}`);
    break;
  }
}
console.log('INBOX URL:', page.url());
await shot('o-1-inbox');

// --- enumerate header + list header controls ---
const head = await page.evaluate(() => {
  const els = [
    ...document.querySelectorAll('button, [role="button"], a, [role="tab"], input'),
  ].filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.top < 130 && r.left > 240;
  });
  return els.map((el) => ({
    tag: el.tagName,
    text: (el.innerText || '').trim().replace(/\n/g, '|').slice(0, 60),
    aria: el.getAttribute('aria-label'),
    title: el.getAttribute('title'),
    role: el.getAttribute('role'),
    x: Math.round(el.getBoundingClientRect().x),
    y: Math.round(el.getBoundingClientRect().y),
  }));
});
console.log('HEADER:', JSON.stringify(head, null, 1).slice(0, 4000));

// --- row dump ---
const row = await page.evaluate(() => {
  const el = document.querySelector('[data-inbox-id]');
  return el
    ? {
        count: document.querySelectorAll('[data-inbox-id]').length,
        html: el.outerHTML.slice(0, 3500),
      }
    : { count: 0 };
});
console.log('ROWCOUNT:', row.count);
if (row.html) fs.writeFileSync(`${EV}/o-row.html`, row.html);

// --- header ⋯ menu ---
const moreBtn = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button')].filter(
    (b) =>
      (b.getAttribute('title') || '').match(/notification actions/i) ||
      (b.getAttribute('aria-label') || '').match(/notification actions/i),
  );
  if (!btns.length) return null;
  const r = btns[0].getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
if (moreBtn) {
  await page.mouse.click(moreBtn.x, moreBtn.y);
  await page.waitForTimeout(1200);
  await shot('o-2-header-menu');
  const menu = await page.evaluate(() => {
    const menus = [
      ...document.querySelectorAll('[role="menu"], [class*="dropdown"], [class*="Dropdown"]'),
    ].filter((el) => el.getBoundingClientRect().width > 50);
    return menus.map((m) => (m.innerText || '').replace(/\n/g, '|').slice(0, 500));
  });
  console.log('HEADER MENU:', JSON.stringify(menu));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(700);
} else console.log('NO ⋯ BTN');

await page.close();
await browser.close();
console.log('DONE');
