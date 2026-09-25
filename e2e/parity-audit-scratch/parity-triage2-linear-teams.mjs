// List Linear workspace teams (read-only) to find one with a populated triage queue.
import { connect } from './parity-triage-lib.mjs';
const browser = await connect();
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto('https://linear.app/bdiverifier/settings/teams', {
  waitUntil: 'domcontentloaded',
  timeout: 60000,
});
await page.waitForTimeout(6000);
const teams = await page.evaluate(() => {
  const out = new Set();
  for (const a of document.querySelectorAll('a[href]')) {
    const h = a.getAttribute('href') || '';
    if (/\/settings\/teams\/|\/team\//.test(h))
      out.add(h + ' | ' + a.textContent.trim().slice(0, 60));
  }
  return [...out];
});
console.log('TEAMS:', JSON.stringify(teams, null, 1));
await page.close();
process.exit(0);
