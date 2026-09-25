// Cycles parity audit — Orvilo side (read-only where possible).
import { chromium } from 'playwright';
import fs from 'node:fs';

const OUT = '/tmp/parity-cycles';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
const shot = async (n) => {
  await page.screenshot({ path: `${OUT}/${n}.png` });
  console.log(`saved ${OUT}/${n}.png`);
};

// ── 1. sidebar: look for Try/Cycles rows ────────────────────────────────────
await page.goto('http://localhost:3010/agent-testing/inbox', {
  waitUntil: 'domcontentloaded',
});
await page.waitForTimeout(6000);
console.log('URL:', page.url());
const sidebarRows = await page.evaluate(() => {
  const nav = document.querySelector('nav') || document.body;
  const rows = [];
  const walker = document.createTreeWalker(nav, NodeFilter.SHOW_ELEMENT);
  while (walker.nextNode()) {
    const el = walker.currentNode;
    const t = (el.textContent || '').trim();
    if (/cycle|try|initiative|周期|尝试|倡议/i.test(t) && t.length < 80) {
      const r = el.getBoundingClientRect();
      if (r.width > 0) rows.push({ text: t, tag: el.tagName, y: Math.round(r.y) });
    }
  }
  return rows.slice(0, 20);
});
console.log('ORVILO SIDEBAR cycle/try/initiative hits:', JSON.stringify(sidebarRows));
await shot('orvilo-sidebar');

// ── 2. try a /cycles route ──────────────────────────────────────────────────
await page.goto('http://localhost:3010/agent-testing/cycles', {
  waitUntil: 'domcontentloaded',
});
await page.waitForTimeout(4000);
console.log('cycles route URL:', page.url());
const cyclesRouteText = await page.evaluate(() => document.body.innerText.slice(0, 1200));
console.log('CYCLES ROUTE BODY:', cyclesRouteText);
await shot('orvilo-cycles-route');

// ── 3. team issues page → Filter → Cycle picker ────────────────────────────
await page.goto('http://localhost:3010/agent-testing/teams/team_cLY7tmARmiU6?tab=issues', {
  waitUntil: 'domcontentloaded',
});
await page.waitForTimeout(7000);
console.log('team issues URL:', page.url());
const issuesText = await page.evaluate(() => document.body.innerText.slice(0, 1500));
console.log('TEAM ISSUES BODY:', issuesText);
await shot('orvilo-team-issues');

// find Filter button and open it
const filterBtn = page
  .locator('button:has-text("Filter"), button:has-text("筛选"), [aria-label*="filter" i]')
  .first();
const fcount = await page.locator('button:has-text("Filter"), button:has-text("筛选")').count();
console.log('filter button count:', fcount);
if (fcount > 0) {
  await filterBtn.click();
  await page.waitForTimeout(1500);
  await shot('orvilo-filter-open');
  const popText = await page.evaluate(() => document.body.innerText.slice(0, 2500));
  console.log('FILTER POPUP BODY:', popText);
  // find Cycle row inside popup
  const cycRow = page.locator('text=/^Cycle$|^周期$/').last();
  const cc = await page.locator('text=/^Cycle$|^周期$/').count();
  console.log('cycle row count:', cc);
}

// ── 4. deep link with ?cycle=<id> ───────────────────────────────────────────
await page.goto(
  'http://localhost:3010/agent-testing/teams/team_cLY7tmARmiU6?tab=issues&cycle=e02776ed-2d86-4b47-b6d5-fcb3b79d7114',
  { waitUntil: 'domcontentloaded' },
);
await page.waitForTimeout(7000);
const filteredText = await page.evaluate(() => document.body.innerText.slice(0, 2000));
console.log('CYCLE-FILTERED BODY:', filteredText);
await shot('orvilo-team-issues-cycle-filtered');

await page.close();
process.exit(0);
