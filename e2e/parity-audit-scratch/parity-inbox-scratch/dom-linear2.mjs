import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto('https://linear.app/bdiverifier/inbox', { waitUntil: 'domcontentloaded' });
// wait for a notification row link to appear
try {
  await page.waitForSelector('text=unread notifications', { timeout: 20000 });
} catch {
  console.log('no unread-notifications text');
}
await page.waitForTimeout(3000);
console.log('URL:', page.url());
const out = await page.evaluate(() => {
  const res = {};
  const all = [...document.querySelectorAll('button, [role="button"], a[href]')].filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.top < 900;
  });
  // group by region: header (top<70), tabrow (70-140), rest
  const sig = (el) => ({
    tag: el.tagName,
    text: (el.innerText || '').trim().replace(/\n/g, '|').slice(0, 80),
    aria: el.getAttribute('aria-label') || el.getAttribute('aria-haspopup') || '',
    title: el.getAttribute('title') || '',
    href: el.getAttribute('href') || '',
    x: Math.round(el.getBoundingClientRect().x),
    y: Math.round(el.getBoundingClientRect().y),
    w: Math.round(el.getBoundingClientRect().width),
  });
  res.header = all
    .filter((el) => el.getBoundingClientRect().top < 70 && el.getBoundingClientRect().left > 240)
    .map(sig);
  res.tabrow = all
    .filter((el) => {
      const t = el.getBoundingClientRect().top;
      return t >= 70 && t < 150;
    })
    .map(sig);
  // count rows: anchors under x>260 x<660 y>200
  res.rows = all
    .filter((el) => {
      const r = el.getBoundingClientRect();
      return r.left > 255 && r.left < 680 && r.top > 200;
    })
    .map(sig)
    .slice(0, 25);
  return res;
});
console.log(JSON.stringify(out, null, 1));
await page.screenshot({ path: '/tmp/parity-inbox-evidence/linear-inbox-dom.png' });
await page.close();
await browser.close();
