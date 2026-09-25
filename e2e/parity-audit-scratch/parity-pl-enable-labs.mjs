/* Enable Projects lab flag via settings UI, then audit projects page. */
import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto('http://localhost:3010/agent-testing/settings/labs', {
  waitUntil: 'domcontentloaded',
});
await page.bringToFront().catch(() => {});
await page.waitForTimeout(6000);
console.log('URL:', page.url());
const text = await page.evaluate(() => document.body.innerText.slice(0, 1500));
console.log(text.replace(/\n/g, ' | ').slice(0, 1200));
// Find switches/checkboxes and the row containing "project"
const switches = await page.evaluate(() => {
  return [
    ...document.querySelectorAll(
      'button[role="switch"], [role="switch"], input[type="checkbox"], button',
    ),
  ]
    .map((el) => {
      const r = el.getBoundingClientRect();
      const row = el.closest('li, div[class*="item"], div[class*="Item"], tr, section, div');
      return {
        tag: el.tagName,
        role: el.getAttribute('role'),
        checked: el.getAttribute('aria-checked') || el.checked,
        label: (el.getAttribute('aria-label') || row?.innerText || el.innerText || '')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 100),
        x: Math.round(r.x),
        y: Math.round(r.y),
      };
    })
    .filter((c) => c.y > 0);
});
console.log(JSON.stringify(switches, null, 1));
await page.close();
await browser.close();
console.log('DONE');
