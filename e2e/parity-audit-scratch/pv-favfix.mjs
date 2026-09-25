import { chromium } from 'playwright';
import fs from 'node:fs';
const OUT = '/Users/devin/repos/wt-parity-views/.agents/runtime-acceptance/parity-2026-09-23/views';
const b = await chromium.connectOverCDP('http://localhost:9222', { timeout: 120000 });
const p = await b.contexts()[0].newPage();
try {
  await p.goto('https://linear.app/bdiverifier/view/all-issues-3320169ce6ab', {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await p.waitForTimeout(9000);
  const state = async () =>
    await p.evaluate(() =>
      [...document.querySelectorAll('button')]
        .map((x) => ({
          a: x.getAttribute('aria-label'),
          y: Math.round(x.getBoundingClientRect().y),
        }))
        .filter((o) => o.a && o.a.toLowerCase().includes('favorite')),
    );
  const before = await state();
  // click EVERY "Remove from favorites" if the view is favorited (target state: Add to favorites)
  const rm = p.locator('button[aria-label="Remove from favorites"]');
  const cnt = await rm.count();
  if (cnt > 0) {
    await rm.first().click();
    await p.waitForTimeout(1500);
  }
  const after = await state();
  fs.writeFileSync('/tmp/pv-favfix.json', JSON.stringify({ before, after, clicked: cnt }));
  await p.screenshot({ path: `${OUT}/lin-fav-restored.png` });
} finally {
  await p.close();
  await b.close();
}
