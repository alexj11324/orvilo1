import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => p.url().includes('settings/performance'));
console.log('page:', page ? 'found' : 'not found');
if (page) {
  await page.bringToFront();
  // Playwright piercing css: find toggle labeled Memory Saver
  const txt = await page
    .locator('text=/memory saver/i')
    .allTextContents()
    .catch(() => []);
  console.log('labels:', JSON.stringify(txt));
  // try clicking the cr-toggle control next to it
  const sw = page.locator('cr-toggle#control, cr-toggle[aria-label*="Memory" i]').first();
  console.log('toggle count:', await page.locator('cr-toggle').count());
}
process.exit(0);
