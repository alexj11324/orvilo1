/* Retry: check auth state, enable Projects lab flag via settings UI. */
import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
await page.setViewportSize({ width: 1440, height: 900 });
// first hit projects page to check auth
await page.goto('http://localhost:3010/agent-testing/projects', { waitUntil: 'domcontentloaded' });
await page.bringToFront().catch(() => {});
await page.waitForTimeout(6000);
console.log('projects URL:', page.url());
const t1 = await page.evaluate(() => document.body.innerText.slice(0, 300));
console.log('PROJ:', t1.replace(/\n/g, ' | ').slice(0, 300));

await page.goto('http://localhost:3010/agent-testing/settings/labs', {
  waitUntil: 'domcontentloaded',
});
await page.waitForTimeout(6000);
console.log('labs URL:', page.url());
const t2 = await page.evaluate(() => document.body.innerText.slice(0, 1500));
console.log('LABS:', t2.replace(/\n/g, ' | ').slice(0, 1200));
const switches = await page.evaluate(() => {
  return [...document.querySelectorAll('[role="switch"], input[type="checkbox"]')]
    .map((el) => {
      const r = el.getBoundingClientRect();
      let row = el;
      for (let i = 0; i < 5 && row.parentElement; i++) {
        row = row.parentElement;
        if ((row.innerText || '').trim().length > 3) break;
      }
      return {
        checked: el.getAttribute('aria-checked') ?? el.checked,
        label: (row.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 90),
        x: Math.round(r.x),
        y: Math.round(r.y),
      };
    })
    .filter((c) => c.y > 0);
});
console.log('SWITCHES:', JSON.stringify(switches, null, 1));
await page.close();
await browser.close();
console.log('DONE');
