import { chromium } from 'playwright';

const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
const shot = (name) =>
  page.screenshot({ path: `/tmp/parity-semantics/${name}.png` }).catch(() => {});
const dump = async (label) => {
  const t = await page.evaluate(() => document.body.innerText);
  console.log(`=== ${label} [${page.url()}] ===\n`, t.slice(0, 4500), '\n');
};

try {
  await page.goto('https://linear.app/bdiverifier/projects', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(9000);
  await shot('linear-projects');
  await dump('PROJECTS');

  // My issues — tabs
  await page.goto('https://linear.app/bdiverifier/my-issues/assigned', {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForTimeout(8000);
  await shot('linear-my-issues');
  await dump('MY-ISSUES');
} catch (e) {
  console.log('ERR', e.message);
}
await page.close();
