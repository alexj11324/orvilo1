import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto('https://linear.app/bdiverifier/team/ORV/triage', {
  waitUntil: 'domcontentloaded',
});
await page.waitForTimeout(5000);

// 1. Enumerate all buttons/icons in the list-pane header
const header = await page.evaluate(() => {
  const out = [];
  const els = document.querySelectorAll(
    'header button, header [role="button"], header a, header svg',
  );
  for (const el of els) {
    const r = el.getBoundingClientRect();
    if (r.width === 0) continue;
    const btn = el.closest('button, [role="button"], a');
    out.push({
      tag: el.tagName.toLowerCase(),
      aria: el.getAttribute('aria-label') || btn?.getAttribute('aria-label'),
      title: el.getAttribute('title') || btn?.getAttribute('title'),
      text: (btn || el).textContent?.trim().slice(0, 60),
      rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
      kbd: (btn || el).querySelector('kbd')?.textContent,
    });
  }
  return out;
});
console.log('=== HEADER CONTROLS ===');
console.log(JSON.stringify(header, null, 1));

// 2. Dump all text content of the list pane
const listPane = await page.evaluate(() => {
  const panes = document.querySelectorAll('main > div > div > div');
  const texts = [];
  for (const p of panes) {
    const r = p.getBoundingClientRect();
    texts.push({
      rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
      text: p.textContent?.slice(0, 300),
    });
  }
  return texts;
});
console.log('=== PANES ===');
console.log(JSON.stringify(listPane, null, 1));

// 3. Check workspace teams list via settings (read-only)
await page.goto('https://linear.app/bdiverifier/settings/teams', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(4000);
const teams = await page.evaluate(() => {
  const rows = document.querySelectorAll('a[href*="/settings/teams/"], a[href*="/team/"]');
  const out = new Set();
  for (const r of rows) out.add(r.getAttribute('href') + ' | ' + r.textContent.trim().slice(0, 50));
  return [...out];
});
console.log('=== TEAMS ===');
console.log(JSON.stringify(teams, null, 1));
await page.screenshot({ path: '/tmp/parity-audit-2026-09-23/triage/linear-teams-list.png' });
await page.close();
process.exit(0);
