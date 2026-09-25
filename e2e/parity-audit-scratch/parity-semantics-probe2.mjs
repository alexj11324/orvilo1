import { chromium } from 'playwright';

const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
const shot = (name) =>
  page
    .screenshot({ path: `/tmp/parity-semantics/${name}.png` })
    .catch((e) => console.log('shot fail', name, e.message));
const text = () => page.evaluate(() => document.body.innerText);

try {
  // Projects list → open first project
  await page.goto('https://linear.app/bdiverifier/projects', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  await shot('linear-projects-list');
  const t = await text();
  console.log('=== PROJECTS PAGE ===\n', t.slice(0, 3500));
} catch (e) {
  console.log('ERR', e.message);
}
await page.close();
