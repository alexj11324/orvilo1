// Cycles audit — Orvilo via standalone headless Chromium (CDP is saturated).
// Logs in via the real auth flow, then audits sidebar / team issues / cycles route.
import { chromium } from 'playwright';
import fs from 'node:fs';

const OUT = '/tmp/parity-cycles';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.setDefaultTimeout(90000);
page.on('pageerror', (e) => console.log('PAGE-ERR:', String(e).slice(0, 200)));

const snap = (n) =>
  page.screenshot({ path: `${OUT}/${n}.png`, timeout: 60000 }).then(
    () => console.log('saved', n),
    (e) => console.log('shot failed', n, String(e).slice(0, 100)),
  );

const waitLoaded = async () => {
  for (let i = 0; i < 60; i++) {
    const txt = await page.evaluate(() => document.body.innerText.slice(0, 600)).catch(() => '');
    if (txt && !/Still loading/i.test(txt)) return txt;
    await page.waitForTimeout(3000);
  }
  return '(never loaded)';
};

// ── login ───────────────────────────────────────────────────────────────────
console.log('== login ==');
await page.goto('http://localhost:3010/signin', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(8000);
const dismissAgree = async () => {
  const agree = page.getByRole('button', { name: /agree and continue/i });
  if (await agree.count()) {
    if (
      await agree
        .first()
        .isVisible()
        .catch(() => false)
    ) {
      await agree.first().click();
      await page.waitForTimeout(1000);
    }
  }
};
for (let attempt = 1; attempt <= 3; attempt++) {
  console.log('login attempt', attempt, 'at', page.url());
  await dismissAgree();
  const email = page
    .locator('input[type="email"], input[name="email"], input[placeholder*="email" i]')
    .first();
  if (await email.count()) {
    await email.click();
    await page.keyboard.type('agent-testing@orvilo.aspectlylabs.com', { delay: 15 });
    const got = await email.inputValue().catch(() => '');
    console.log('email=', got);
    if (!got.includes('agent-testing')) continue;
    const cb = page.locator('text=/I have read and agree/i').first();
    if (await cb.count()) {
      await cb.click().catch(() => {});
      await page.waitForTimeout(900);
    }
    await dismissAgree();
    await page
      .getByRole('button', { name: /next|下一步|继续/i })
      .first()
      .click();
    await page.waitForTimeout(6000);
    const pwd = page.locator('input[type="password"]').first();
    if (await pwd.count()) {
      await pwd.click();
      await page.keyboard.type('TestPassword123!', { delay: 15 });
      await page
        .getByRole('button', { name: /sign in|log in|登录|submit|next|继续/i })
        .first()
        .click();
      await page.waitForTimeout(8000);
    }
  }
  console.log('after attempt', attempt, 'url:', page.url());
  if (!page.url().includes('/signin')) break;
  await page.goto('http://localhost:3010/signin', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);
}
console.log('LOGIN RESULT URL:', page.url());

// ── 1. sidebar at inbox ─────────────────────────────────────────────────────
await page.goto('http://localhost:3010/agent-testing/inbox', {
  waitUntil: 'domcontentloaded',
});
const inboxBody = await waitLoaded();
console.log('INBOX URL:', page.url());
console.log('INBOX BODY head:', inboxBody.slice(0, 800));
const sidebarHits = await page.evaluate(() => {
  const rows = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
  while (walker.nextNode()) {
    const el = walker.currentNode;
    const t = (el.textContent || '').trim();
    if (/cycle|initiative|^try$|周期|倡议/i.test(t) && t.length < 60) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && r.height < 60)
        rows.push({ t, tag: el.tagName, y: Math.round(r.y) });
    }
  }
  return rows.slice(0, 20);
});
console.log('SIDEBAR HITS:', JSON.stringify(sidebarHits));
// full nav item list for the record
const navItems = await page.evaluate(() => {
  const nav = document.querySelector('nav');
  if (!nav) return '(no nav)';
  return [...nav.querySelectorAll('a,button')]
    .map((el) => (el.textContent || '').trim())
    .filter((t) => t && t.length < 40)
    .slice(0, 60);
});
console.log('NAV ITEMS:', JSON.stringify(navItems));
await snap('orvilo-sidebar-loaded');

// ── 2. /agent-testing/cycles ────────────────────────────────────────────────
await page.goto('http://localhost:3010/agent-testing/cycles', {
  waitUntil: 'domcontentloaded',
});
const cycBody = await waitLoaded();
console.log('CYCLES URL:', page.url());
console.log('CYCLES BODY:', cycBody.slice(0, 1200));
await snap('orvilo-cycles-route-loaded');

// ── 3. team issues + filter popover ─────────────────────────────────────────
await page.goto('http://localhost:3010/agent-testing/teams/team_cLY7tmARmiU6?tab=issues', {
  waitUntil: 'domcontentloaded',
});
const issuesBody = await waitLoaded();
await page.waitForTimeout(3000);
console.log('ISSUES URL:', page.url());
console.log('ISSUES BODY:', issuesBody.slice(0, 2000));
await snap('orvilo-team-issues-loaded');

// open Filter popover
const filterBtn = page
  .locator('button')
  .filter({ hasText: /filter|筛选/i })
  .first();
if (await filterBtn.count()) {
  await filterBtn.click();
  await page.waitForTimeout(1500);
  console.log('FILTER POP:', await page.evaluate(() => document.body.innerText.slice(0, 2200)));
  await snap('orvilo-filter-popover');
  await page.keyboard.press('Escape');
}

// ── 4. cycle deep-link ──────────────────────────────────────────────────────
await page.goto(
  'http://localhost:3010/agent-testing/teams/team_cLY7tmARmiU6?tab=issues&cycle=e02776ed-2d86-4b47-b6d5-fcb3b79d7114',
  { waitUntil: 'domcontentloaded' },
);
const filtBody = await waitLoaded();
await page.waitForTimeout(3000);
console.log('CYCLE-FILTERED BODY:', filtBody.slice(0, 2000));
await snap('orvilo-team-issues-cycle');

// ── 5. group-by cycle on board ──────────────────────────────────────────────
await page.goto(
  'http://localhost:3010/agent-testing/teams/team_cLY7tmARmiU6?tab=issues&layout=board&grouping=cycle',
  { waitUntil: 'domcontentloaded' },
);
const grpBody = await waitLoaded();
await page.waitForTimeout(3000);
console.log('GROUPED BODY:', grpBody.slice(0, 2000));
await snap('orvilo-team-issues-grouped-cycle');

await browser.close();
process.exit(0);
