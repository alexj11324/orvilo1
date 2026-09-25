import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto('https://linear.app/bdiverifier/inbox/priority', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('text=unread notifications', { timeout: 20000 });
await page.waitForTimeout(2500);

// Enumerate row structure: find elements containing "mentioned you" / "Marked as"
const info = await page.evaluate(() => {
  const marks = [...document.querySelectorAll('a, [role="link"], li, [class*="row"]')].filter(
    (el) => {
      const r = el.getBoundingClientRect();
      return (
        r.left > 250 && r.left < 700 && r.top > 190 && r.top < 880 && r.height > 30 && r.height < 90
      );
    },
  );
  return marks.slice(0, 12).map((el) => ({
    tag: el.tagName,
    role: el.getAttribute('role'),
    href: el.getAttribute('href'),
    text: (el.innerText || '').trim().replace(/\n/g, '|').slice(0, 110),
    cls: (el.className || '').toString().slice(0, 60),
    y: Math.round(el.getBoundingClientRect().y),
  }));
});
console.log('ROWS:', JSON.stringify(info, null, 1).slice(0, 6000));
await page.close();
await browser.close();
