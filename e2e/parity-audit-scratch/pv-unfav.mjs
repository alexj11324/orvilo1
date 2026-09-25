import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://localhost:9222', { timeout: 120000 });
const page = await browser.contexts()[0].newPage();
try {
  await page.goto('https://linear.app/bdiverifier/view/all-issues-3320169ce6ab', {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await page.waitForTimeout(8000);
  const rm = page
    .locator(
      'main button[aria-label="Remove from favorites"], header + * button[aria-label="Remove from favorites"], button[aria-label="Remove from favorites"]',
    )
    .first();
  const add = page.locator('button[aria-label="Add to favorites"]').first();
  if (await rm.count()) {
    await rm.click();
    await page.waitForTimeout(1200);
  }
  const state = await page.evaluate(() =>
    [...document.querySelectorAll('button')]
      .map((b) => b.getAttribute('aria-label'))
      .filter((a) => a && a.includes('avorite')),
  );
  require('node:fs');
  console.log('fav state after restore:', JSON.stringify(state));
} finally {
  await page.close();
  await browser.close();
}
