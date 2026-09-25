import { chromium } from 'playwright';
import fs from 'fs';
const out = '/tmp/parity-project-detail/linear-projects-list.json';
const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
try {
  await page.goto('https://linear.app/bdiverifier/projects/all', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(7000);
  const links = await page.$$eval('a[href*="/project/"]', (els) =>
    els
      .map((a) => ({
        href: a.getAttribute('href'),
        text: (a.textContent || '').trim().slice(0, 80),
      }))
      .filter((x) => x.href && !x.href.endsWith('/all'))
      .slice(0, 60),
  );
  fs.writeFileSync(out, JSON.stringify(links, null, 1));
  await page.screenshot({ path: '/tmp/parity-project-detail/linear-projects-all.png' });
  fs.writeFileSync('/tmp/parity-project-detail/done.txt', 'done');
} catch (e) {
  fs.writeFileSync(out, 'ERROR: ' + e.message);
}
