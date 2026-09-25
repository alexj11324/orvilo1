import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto('https://linear.app/bdiverifier/inbox', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(7000);
console.log('URL:', page.url());
const out = await page.evaluate(() => {
  const res = {};
  // find main region
  const main = document.querySelector('main') || document.body;
  // Header buttons: all buttons in first ~60px of main
  res.headerButtons = [...main.querySelectorAll('button, [role="button"], a')]
    .filter((el) => {
      const r = el.getBoundingClientRect();
      return r.top < 70 && r.width > 0;
    })
    .map((el) => ({
      tag: el.tagName,
      text: (el.innerText || '').trim().slice(0, 60),
      aria: el.getAttribute('aria-label'),
      title: el.getAttribute('title'),
      cls: (el.className || '').toString().slice(0, 80),
      rect: JSON.stringify(el.getBoundingClientRect()),
      html: el.outerHTML.slice(0, 300),
    }));
  // tabs
  res.tabs = [
    ...main.querySelectorAll('[role="tab"], [role="tablist"] a, [role="tablist"] button'),
  ].map((el) => ({
    text: (el.innerText || '').trim().slice(0, 60),
    role: el.getAttribute('role'),
    selected: el.getAttribute('aria-selected'),
    href: el.getAttribute('href'),
    html: el.outerHTML.slice(0, 300),
  }));
  // rows — look for list items
  res.rowCount = main.querySelectorAll(
    '[class*="row"], li, [role="option"], [role="listitem"]',
  ).length;
  return res;
});
console.log(JSON.stringify(out, null, 1).slice(0, 12000));
await page.close();
await browser.close();
