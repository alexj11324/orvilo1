import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
await page.setViewportSize({ width: 1440, height: 900 });

// Check teams list in settings (read-only)
await page.goto('https://linear.app/bdiverifier/settings/teams', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(5000);
const teams = await page.evaluate(() => {
  const out = [];
  const links = document.querySelectorAll('a');
  for (const a of links) {
    const h = a.getAttribute('href') || '';
    if (h.includes('/team/') || h.includes('teams/'))
      out.push(h + ' | ' + a.textContent.trim().slice(0, 60));
  }
  return [...new Set(out)];
});
console.log('TEAMS:', JSON.stringify(teams, null, 1));
console.log('BODY TEXT SNIP:', await page.evaluate(() => document.body.innerText.slice(0, 1500)));
await page.close();
process.exit(0);
