// Cycles audit — Orvilo side, pass 2 (longer waits, error capture).
import { chromium } from 'playwright';
import fs from 'node:fs';

const OUT = '/tmp/parity-cycles';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
page.on('console', (m) => {
  if (m.type() === 'error') console.log('CONSOLE-ERR:', m.text().slice(0, 200));
});
page.on('pageerror', (e) => console.log('PAGE-ERR:', String(e).slice(0, 300)));
const shot = async (n) => {
  await page.screenshot({ path: `${OUT}/${n}.png` });
  console.log(`saved ${OUT}/${n}.png`);
};

// ── teams list ──────────────────────────────────────────────────────────────
await page.goto('http://localhost:3010/agent-testing/teams', {
  waitUntil: 'domcontentloaded',
});
await page.waitForTimeout(9000);
console.log('teams list URL:', page.url());
console.log('TEAMS BODY:', await page.evaluate(() => document.body.innerText.slice(0, 1500)));
await shot('orvilo-teams-list');

// ── team issues ─────────────────────────────────────────────────────────────
await page.goto('http://localhost:3010/agent-testing/teams/team_cLY7tmARmiU6?tab=issues', {
  waitUntil: 'domcontentloaded',
});
await page.waitForTimeout(10000);
console.log('team issues URL:', page.url());
console.log('TEAM ISSUES BODY:', await page.evaluate(() => document.body.innerText.slice(0, 2000)));
await shot('orvilo-team-issues2');

// ── cycles deep route final state ───────────────────────────────────────────
await page.goto('http://localhost:3010/agent-testing/cycles', {
  waitUntil: 'domcontentloaded',
});
await page.waitForTimeout(9000);
console.log('cycles URL after settle:', page.url());
console.log('CYCLES BODY:', await page.evaluate(() => document.body.innerText.slice(0, 1200)));
await shot('orvilo-cycles-route2');

await page.close();
process.exit(0);
