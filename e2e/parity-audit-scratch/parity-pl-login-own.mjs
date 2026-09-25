/* Own-chrome login — verify each step's effect. */
import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9333', { timeout: 30000 });
const ctx = browser.contexts()[0];
const page = ctx.pages()[0] || (await ctx.newPage());
await page.setViewportSize({ width: 1440, height: 900 });
try {
  await page.goto('http://localhost:3010/signin', { waitUntil: 'commit', timeout: 20000 });
} catch {}
await page.bringToFront().catch(() => {});
await page.waitForTimeout(8000);

const shot = async (name) => page.screenshot({ path: `/tmp/pl-${name}.png` });
const inputState = async () =>
  page.evaluate(() =>
    [...document.querySelectorAll('input')]
      .map((i) => `${i.type}:${i.placeholder || ''}="${i.value}"`)
      .join(' || '),
  );

// click email field, type
const emailBox = await page.evaluate(() => {
  const el = [...document.querySelectorAll('input')].find((i) =>
    /mail|email|username/i.test(i.placeholder || ''),
  );
  const r = el?.getBoundingClientRect();
  return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
});
console.log('emailBox', emailBox);
await page.mouse.click(emailBox.x, emailBox.y);
await page.waitForTimeout(500);
await page.keyboard.type('agent-testing@orvilo.aspectlylabs.com', { delay: 15 });
await page.waitForTimeout(400);
console.log('inputs:', await inputState());
await shot('typed');

// click Next at its real coords
const nextBox = await page.evaluate(() => {
  const els = [...document.querySelectorAll('button')].filter((b) =>
    /^(next|下一步|继续)$/i.test((b.innerText || '').trim()),
  );
  return els.map((b) => {
    const r = b.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, visible: r.width > 0 };
  });
});
console.log('next boxes:', JSON.stringify(nextBox));
const vis = nextBox.find((b) => b.visible);
if (vis) {
  await page.mouse.click(vis.x, vis.y);
}
await page.waitForTimeout(3500);
await shot('after-next');
console.log('url:', page.url());
console.log('inputs:', await inputState());

// handle T&C modal if present (click Agree)
const agreeBox = await page.evaluate(() => {
  const els = [...document.querySelectorAll('button')].filter((b) =>
    /agree and continue/i.test(b.innerText || ''),
  );
  return els.map((b) => {
    const r = b.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, visible: r.width > 0 };
  });
});
console.log('agree boxes:', JSON.stringify(agreeBox));
const av = agreeBox.find((b) => b.visible);
if (av) {
  await page.mouse.click(av.x, av.y);
  await page.waitForTimeout(3000);
  // click Next again now that T&C is accepted
  const nb2 = await page.evaluate(() => {
    const els = [...document.querySelectorAll('button')].filter((b) =>
      /^(next|下一步|继续)$/i.test((b.innerText || '').trim()),
    );
    return els
      .map((b) => {
        const r = b.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2, visible: r.width > 0 };
      })
      .find((b) => b.visible);
  });
  if (nb2) {
    await page.mouse.click(nb2.x, nb2.y);
    await page.waitForTimeout(3500);
  }
}
await shot('post-agree');
console.log('url2:', page.url());
console.log('inputs2:', await inputState());

const pwdBox = await page.evaluate(() => {
  const el = document.querySelector('input[type="password"]');
  const r = el?.getBoundingClientRect();
  return r && r.width ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
});
if (pwdBox) {
  await page.mouse.click(pwdBox.x, pwdBox.y);
  await page.waitForTimeout(300);
  await page.keyboard.type('TestPassword123!', { delay: 15 });
  await page.waitForTimeout(300);
  const signBox = await page.evaluate(() => {
    const els = [...document.querySelectorAll('button')].filter((b) => {
      const r = b.getBoundingClientRect();
      return r.width > 0 && /sign in|log in|登录|^next$|继续/i.test((b.innerText || '').trim());
    });
    const b = els[0];
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  console.log('signBox', signBox);
  if (signBox) await page.mouse.click(signBox.x, signBox.y);
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(2000);
    if (!page.url().includes('/signin')) break;
  }
}
console.log('FINAL:', page.url());
await shot('final');
await browser.close();
console.log('DONE');
