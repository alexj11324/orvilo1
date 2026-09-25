import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
await page.setViewportSize({ width: 1440, height: 900 });
try {
  await page.goto('http://localhost:3010/agent-testing/teams/team_KNsVSioFk8hO?tab=triage', {
    waitUntil: 'commit',
    timeout: 20000,
  });
} catch (e) {
  console.log('goto err:', e.message);
}
await page.waitForTimeout(8000);
console.log('URL:', page.url());
console.log('TITLE:', await page.title().catch(() => 'n/a'));
const bodyText = await page
  .evaluate(() => document.body?.innerText?.slice(0, 800))
  .catch(() => 'EVAL FAIL');
console.log('BODY:', bodyText);
await page
  .screenshot({
    path: '/tmp/parity-audit-2026-09-23/triage/orvilo-triage-initial.png',
    timeout: 10000,
  })
  .catch((e) => console.log('shot err', e.message));
await page.close();
process.exit(0);
