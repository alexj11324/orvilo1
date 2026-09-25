import { chromium } from 'playwright';
import fs from 'node:fs';
const b = await chromium.connectOverCDP('http://localhost:9222', { timeout: 120000 });
const p = await b.contexts()[0].newPage();
try {
  await p.goto('https://linear.app/bdiverifier/view/all-issues-3320169ce6ab', {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await p.waitForTimeout(8000);
  const fav = await p.evaluate(() =>
    [...document.querySelectorAll('button')]
      .map((x) => x.getAttribute('aria-label'))
      .filter((a) => a && a.toLowerCase().includes('favorite')),
  );
  fs.writeFileSync('/tmp/pv-fav.json', JSON.stringify({ fav }));
} finally {
  await p.close();
  await b.close();
}
