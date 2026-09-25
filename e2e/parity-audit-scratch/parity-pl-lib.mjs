/* Shared helpers: resilient CDP connect + Orvilo login if bounced. */
import { chromium } from 'playwright';

export async function connectCDP(tries = 8) {
  for (let i = 0; i < tries; i++) {
    try {
      return await chromium.connectOverCDP('http://localhost:9222', { timeout: 25000 });
    } catch (e) {
      console.log(`connect retry ${i}: ${e.message.split('\n')[0]}`);
      await new Promise((r) => setTimeout(r, 4000));
    }
  }
  return null;
}

const clickAt = async (page, find) => {
  const box = await page.evaluate(find);
  if (!box) return false;
  await page.mouse.click(box.x, box.y);
  return true;
};

export async function ensureOrviloAuth(page, targetUrl) {
  try {
    await page.goto(targetUrl, { waitUntil: 'commit', timeout: 25000 });
  } catch {}
  await page.bringToFront().catch(() => {});
  await page.waitForTimeout(8000);
  if (!page.url().includes('/signin')) return true;
  console.log('bounced to signin — logging in');
  // email step
  const emailBox = await page.evaluate(() => {
    const el = [...document.querySelectorAll('input')].find((i) =>
      /mail|email|username/i.test(i.placeholder || ''),
    );
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  if (!emailBox) return false;
  await page.mouse.click(emailBox.x, emailBox.y);
  await page.waitForTimeout(400);
  await page.keyboard.type('agent-testing@orvilo.aspectlylabs.com', { delay: 8 });
  await page.waitForTimeout(300);
  // T&C checkbox
  const cb = await page.evaluate(() => {
    const el = document.querySelector('[role="checkbox"], input[type="checkbox"]');
    if (!el) return null;
    const checked = el.getAttribute('aria-checked') ?? el.checked;
    const r = el.getBoundingClientRect();
    return { checked, x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  if (cb && String(cb.checked) !== 'true' && cb.x > 0) {
    await page.mouse.click(cb.x, cb.y);
    await page.waitForTimeout(600);
  }
  // Agree-and-continue modal if present
  const agree = await page.evaluate(() => {
    const el = [...document.querySelectorAll('button')].find((b) =>
      /agree and continue/i.test(b.innerText || ''),
    );
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return r.width ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
  });
  if (agree) {
    await page.mouse.click(agree.x, agree.y);
    await page.waitForTimeout(1000);
  }
  // Next
  await clickAt(page, () => {
    const el = [...document.querySelectorAll('button')].find((b) =>
      /^(next|下一步|继续)$/i.test((b.innerText || '').trim()),
    );
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.waitForTimeout(4500);
  // password
  const pwdBox = await page.evaluate(() => {
    const el = document.querySelector('input[type="password"]');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  if (pwdBox) {
    await page.mouse.click(pwdBox.x, pwdBox.y);
    await page.waitForTimeout(300);
    await page.keyboard.type('TestPassword123!', { delay: 8 });
    await page.waitForTimeout(300);
    await clickAt(page, () => {
      const el = [...document.querySelectorAll('button')].find(
        (b) =>
          b.type === 'submit' || /sign in|log in|登录|next|继续/i.test((b.innerText || '').trim()),
      );
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    await page.waitForTimeout(9000);
  }
  try {
    await page.goto(targetUrl, { waitUntil: 'commit', timeout: 25000 });
  } catch {}
  await page.waitForTimeout(8000);
  const ok = !page.url().includes('/signin');
  console.log('login result:', ok ? 'OK' : 'FAILED', page.url());
  return ok;
}
