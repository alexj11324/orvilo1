import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', e.message.slice(0, 200)));
page.on('console', (m) => {
  if (m.type() === 'error') console.log('CONSOLE:', m.text().slice(0, 200));
});
await page.setViewportSize({ width: 1440, height: 900 });
try {
  await page.goto('http://localhost:3010/agent-testing/teams/team_KNsVSioFk8hO?tab=triage', {
    waitUntil: 'commit',
    timeout: 20000,
  });
} catch (e) {
  console.log('goto err:', e.message);
}

// Wait until the triage surface actually renders (rows or empty state), up to 30s
let settled = false;
for (let i = 0; i < 15; i++) {
  await page.waitForTimeout(2000);
  const state = await page
    .evaluate(() => {
      const txt = document.body?.innerText || '';
      const hasSkeleton = !!document.querySelector('[class*="skeleton"], [class*="Skeleton"]');
      const mainKids = document.querySelector('main')?.children.length ?? -1;
      return {
        len: txt.length,
        hasSkeleton,
        mainKids,
        snip: txt.slice(0, 200).replace(/\n/g, '|'),
      };
    })
    .catch(() => ({ err: true }));
  console.log(`t=${(i + 1) * 2}s`, JSON.stringify(state).slice(0, 300));
  if (state.mainKids > 0 && !state.hasSkeleton && state.len > 50) {
    settled = true;
    break;
  }
}
console.log('settled:', settled, 'URL:', page.url());
await page
  .screenshot({
    path: '/tmp/parity-audit-2026-09-23/triage/orvilo-triage-loaded.png',
    timeout: 15000,
  })
  .catch((e) => console.log('shot err', e.message));
await page.close();
process.exit(0);
