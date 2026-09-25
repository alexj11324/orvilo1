import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://localhost:9222', { timeout: 120000 });
const ctx = browser.contexts()[0];
let page = ctx.pages().find((p) => p.url().includes('localhost:9814'));
if (!page) {
  page = await ctx.newPage();
  await page.goto('http://localhost:9814/agent-testing/inbox', {
    waitUntil: 'domcontentloaded',
    timeout: 120000,
  });
  await page.waitForTimeout(15000);
}
const info = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('[data-inbox-id]')];
  const rowBtns = rows.map((r) => {
    const wrap = r.closest('.work-inbox-row-actions') || r.parentElement;
    const strip =
      r.parentElement?.querySelector('.work-inbox-row-actions') ||
      r.parentElement?.parentElement?.querySelector('.work-inbox-row-actions');
    return strip
      ? [...strip.querySelectorAll('button,[role="button"],a')].map(
          (b) => b.getAttribute('title') || b.getAttribute('aria-label') || b.textContent?.trim(),
        )
      : null;
  });
  // detail pane open?
  const pane = document.querySelector('[class*="paneHeader"], [class*="detail"]');
  const allTitles = [...document.querySelectorAll('button,[role="button"]')]
    .map((b) => b.getAttribute('title') || b.getAttribute('aria-label'))
    .filter(Boolean);
  return {
    url: location.href,
    rowCount: rows.length,
    rowBtns,
    hasPaneHeader: !!document.querySelector('[class*="paneHeader"]'),
    titles: allTitles,
  };
});
console.log(JSON.stringify(info, null, 2));
browser.close();
