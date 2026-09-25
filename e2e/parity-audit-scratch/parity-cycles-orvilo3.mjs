// Cycles audit — Orvilo side, pass 3 (wait for SPA ready).
import { chromium } from 'playwright';
import fs from 'node:fs';

const OUT = '/tmp/parity-cycles';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGE-ERR:', String(e).slice(0, 300)));

const waitLoaded = async (ms = 45000) => {
  try {
    await page.waitForFunction(() => !/Still loading/i.test(document.body.innerText), {
      timeout: ms,
    });
  } catch {
    console.log('WARN: still loading after', ms);
  }
  await page.waitForTimeout(2000);
};

// ── inbox: sidebar audit ────────────────────────────────────────────────────
await page.goto('http://localhost:3010/agent-testing/inbox', {
  waitUntil: 'domcontentloaded',
});
await waitLoaded();
console.log('inbox URL:', page.url());
const sidebarRows = await page.evaluate(() => {
  const rows = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
  while (walker.nextNode()) {
    const el = walker.currentNode;
    const t = (el.textContent || '').trim();
    if (/cycle|try|initiative|周期|倡议/i.test(t) && t.length < 80) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && r.height < 100)
        rows.push({ text: t, tag: el.tagName, y: Math.round(r.y) });
    }
  }
  return rows.slice(0, 25);
});
console.log('ORVILO SIDEBAR hits:', JSON.stringify(sidebarRows));
await page.screenshot({ path: `${OUT}/orvilo-sidebar.png` });

// ── teams list ──────────────────────────────────────────────────────────────
await page.goto('http://localhost:3010/agent-testing/teams', {
  waitUntil: 'domcontentloaded',
});
await waitLoaded();
console.log('teams URL:', page.url());
console.log('TEAMS BODY:', await page.evaluate(() => document.body.innerText.slice(0, 1500)));
await page.screenshot({ path: `${OUT}/orvilo-teams-list.png` });

// ── team issues ─────────────────────────────────────────────────────────────
await page.goto('http://localhost:3010/agent-testing/teams/team_cLY7tmARmiU6?tab=issues', {
  waitUntil: 'domcontentloaded',
});
await waitLoaded();
await page.waitForTimeout(3000);
console.log('team issues URL:', page.url());
console.log('TEAM ISSUES BODY:', await page.evaluate(() => document.body.innerText.slice(0, 2500)));
await page.screenshot({ path: `${OUT}/orvilo-team-issues.png` });

// enumerate buttons on the issues surface
const btns = await page.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll('button, [role="button"]')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0) continue;
    const t = (el.innerText || el.getAttribute('aria-label') || '').trim();
    if (t) out.push({ t: t.slice(0, 60), y: Math.round(r.y) });
  }
  return out.slice(0, 50);
});
console.log('ISSUES BUTTONS:', JSON.stringify(btns));

// ── cycle deep-link ─────────────────────────────────────────────────────────
await page.goto(
  'http://localhost:3010/agent-testing/teams/team_cLY7tmARmiU6?tab=issues&cycle=e02776ed-2d86-4b47-b6d5-fcb3b79d7114',
  { waitUntil: 'domcontentloaded' },
);
await waitLoaded();
await page.waitForTimeout(3000);
console.log(
  'CYCLE-FILTERED BODY:',
  await page.evaluate(() => document.body.innerText.slice(0, 2500)),
);
await page.screenshot({ path: `${OUT}/orvilo-team-issues-cycle-filtered.png` });

// ── cycles route ────────────────────────────────────────────────────────────
await page.goto('http://localhost:3010/agent-testing/cycles', {
  waitUntil: 'domcontentloaded',
});
await waitLoaded();
console.log('cycles URL:', page.url());
console.log('CYCLES BODY:', await page.evaluate(() => document.body.innerText.slice(0, 1500)));
await page.screenshot({ path: `${OUT}/orvilo-cycles-route.png` });

await page.close();
process.exit(0);
