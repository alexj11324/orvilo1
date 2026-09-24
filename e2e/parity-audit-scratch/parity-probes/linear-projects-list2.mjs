import { chromium } from 'playwright';
import fs from 'fs';
const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
try {
  await page.goto('https://linear.app/bdiverifier/projects', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(8000);
  const url = page.url();
  // grab all anchors
  const links = await page.$$eval('a', (els) =>
    els
      .map((a) => ({
        href: a.getAttribute('href'),
        text: (a.textContent || '').trim().slice(0, 60),
      }))
      .filter((x) => x.href)
      .slice(0, 120),
  );
  const bodyText = (await page.evaluate(() => document.body.innerText)).slice(0, 3000);
  fs.writeFileSync(
    '/tmp/parity-project-detail/linear-projects-list2.json',
    JSON.stringify({ url, links, bodyText }, null, 1),
  );
  await page.screenshot({ path: '/tmp/parity-project-detail/linear-projects-all.png' });
} catch (e) {
  fs.writeFileSync(
    '/tmp/parity-project-detail/linear-projects-list2.json',
    'ERROR: ' + e.message + '\n' + e.stack,
  );
}
