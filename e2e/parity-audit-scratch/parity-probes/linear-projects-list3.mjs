import { chromium } from 'playwright';
import fs from 'fs';
const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
const result = { url: null, links: [], bodyText: '', err: null };
try {
  await page.goto('https://linear.app/bdiverifier/projects', { waitUntil: 'load', timeout: 30000 });
  // wait up to 30s for real content
  for (let i = 0; i < 15; i++) {
    await page.waitForTimeout(2000);
    const t = await page.evaluate(() => document.body.innerText.slice(0, 200));
    if (t && !t.startsWith('Loading')) break;
  }
  result.url = page.url();
  result.links = await page.$$eval('a', (els) =>
    els
      .map((a) => ({
        href: a.getAttribute('href'),
        text: (a.textContent || '').trim().slice(0, 60),
      }))
      .filter((x) => x.href && x.href.includes('project'))
      .slice(0, 80),
  );
  result.bodyText = (await page.evaluate(() => document.body.innerText)).slice(0, 4000);
  await page.screenshot({ path: '/tmp/parity-project-detail/linear-projects-all.png' });
} catch (e) {
  result.err = e.message;
}
fs.writeFileSync(
  '/tmp/parity-project-detail/linear-projects-list2.json',
  JSON.stringify(result, null, 1),
);
