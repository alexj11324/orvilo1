import { chromium } from 'playwright';

const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
const shot = (name) =>
  page.screenshot({ path: `/tmp/parity-semantics/${name}.png` }).catch(() => {});

try {
  // 1) Linear team issues — check status groups + workflow state types
  await page.goto('https://linear.app/bdiverifier/team/ORV/active', {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForTimeout(5000);
  await shot('linear-team-active');
  console.log('URL:', page.url());
  const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 4000));
  console.log('--- team active text ---\n', bodyText.slice(0, 3000));
} catch (e) {
  console.log('ERR', e.message);
}
await page.close();
await browser.close?.();
