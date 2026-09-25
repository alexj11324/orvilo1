// Cycles audit — standalone pass 2: wait for SUBSTANTIAL content.
import { chromium } from 'playwright';
import fs from 'node:fs';

const OUT = '/tmp/parity-cycles';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.setDefaultTimeout(90000);

const snap = (n) =>
  page.screenshot({ path: `${OUT}/${n}.png`, timeout: 60000 }).then(
    () => console.log('saved', n),
    (e) => console.log('shot failed', n, String(e).slice(0, 100)),
  );

const login = async () => {
  await page.goto('http://localhost:3010/signin', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(8000);
  const dismissAgree = async () => {
    const agree = page.getByRole('button', { name: /agree and continue/i });
    if (
      (await agree.count()) &&
      (await agree
        .first()
        .isVisible()
        .catch(() => false))
    ) {
      await agree.first().click();
      await page.waitForTimeout(1000);
    }
  };
  for (let attempt = 1; attempt <= 3; attempt++) {
    await dismissAgree();
    const email = page.locator('input[type="email"], input[name="email"]').first();
    if (await email.count()) {
      await email.click();
      await page.keyboard.type('agent-testing@orvilo.aspectlylabs.com', { delay: 15 });
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
        await page.waitForTimeout(9000);
      }
    }
    if (!page.url().includes('/signin')) break;
    await page.goto('http://localhost:3010/signin', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(6000);
  }
  console.log('LOGIN URL:', page.url());
};

// wait until body has real content (>= minLen chars) or regex hit
const waitRich = async (minLen = 800, re = null) => {
  let last = '';
  for (let i = 0; i < 80; i++) {
    last = await page.evaluate(() => document.body.innerText).catch(() => '');
    if (last.length >= minLen && (!re || re.test(last))) return last;
    await page.waitForTimeout(3000);
  }
  return last;
};

await login();

// ── sidebar at inbox ────────────────────────────────────────────────────────
await page.goto('http://localhost:3010/agent-testing/inbox', { waitUntil: 'domcontentloaded' });
const inbox = await waitRich(800);
console.log('INBOX len:', inbox.length, '| URL:', page.url());
const navDump = await page.evaluate(() => {
  // dump every visible anchor/button-ish row in the left rail area (x < 300)
  const out = [];
  for (const el of document.querySelectorAll('a,button,[role="treeitem"],[role="link"]')) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.x < 320 && r.width < 320) {
      const t = (el.innerText || el.getAttribute('aria-label') || '').trim();
      if (t && t.length < 60)
        out.push({ t, tag: el.tagName, y: Math.round(r.y), href: el.getAttribute('href') });
    }
  }
  return out;
});
console.log('LEFT-RAIL ITEMS:', JSON.stringify(navDump));
const cycHits = navDump.filter((r) => /cycle|initiative|try|周期|倡议/i.test(r.t));
console.log('CYCLE-ISH ROWS:', JSON.stringify(cycHits));
await snap('orvilo-sidebar-loaded');

// ── /agent-testing/cycles ───────────────────────────────────────────────────
await page.goto('http://localhost:3010/agent-testing/cycles', { waitUntil: 'domcontentloaded' });
const cycBody = await waitRich(400);
console.log('CYCLES final URL:', page.url());
console.log('CYCLES BODY head:', cycBody.slice(0, 800));
await snap('orvilo-cycles-route-loaded');

// ── team issues ─────────────────────────────────────────────────────────────
await page.goto('http://localhost:3010/agent-testing/teams/team_cLY7tmARmiU6?tab=issues', {
  waitUntil: 'domcontentloaded',
});
const issues = await waitRich(800, /filter|筛选|status|状态|scope/i);
console.log('ISSUES len:', issues.length);
console.log('ISSUES BODY:', issues.slice(0, 2500));
await snap('orvilo-team-issues-loaded');

const filterBtn = page
  .locator('button')
  .filter({ hasText: /filter|筛选/i })
  .first();
console.log(
  'filter btns:',
  await page
    .locator('button')
    .filter({ hasText: /filter|筛选/i })
    .count(),
);
if (await filterBtn.count()) {
  await filterBtn.click();
  await page.waitForTimeout(2000);
  const pop = await page.evaluate(() => document.body.innerText);
  console.log('FILTER POP:', pop.slice(0, 2600));
  console.log('has Cycle option:', /cycle|周期/i.test(pop));
  await snap('orvilo-filter-popover');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
}

// display options → grouping includes cycle?
const displayBtn = page
  .locator('button')
  .filter({ hasText: /display|显示/i })
  .first();
if (await displayBtn.count()) {
  await displayBtn.click();
  await page.waitForTimeout(2000);
  const dp = await page.evaluate(() => document.body.innerText);
  console.log('DISPLAY POP:', dp.slice(0, 2600));
  console.log('has cycle grouping:', /cycle|周期/i.test(dp));
  await snap('orvilo-display-popover');
  await page.keyboard.press('Escape');
}

// ── cycle deep-link ─────────────────────────────────────────────────────────
await page.goto(
  'http://localhost:3010/agent-testing/teams/team_cLY7tmARmiU6?tab=issues&cycle=e02776ed-2d86-4b47-b6d5-fcb3b79d7114',
  { waitUntil: 'domcontentloaded' },
);
const filtered = await waitRich(600);
await page.waitForTimeout(2000);
console.log('CYCLE-FILTERED BODY:', filtered.slice(0, 2200));
console.log('mentions Parity Cycle:', /Parity Cycle/i.test(filtered));
await snap('orvilo-team-issues-cycle');

// ── group-by cycle board ────────────────────────────────────────────────────
await page.goto(
  'http://localhost:3010/agent-testing/teams/team_cLY7tmARmiU6?tab=issues&layout=board&grouping=cycle',
  { waitUntil: 'domcontentloaded' },
);
const grouped = await waitRich(600);
await page.waitForTimeout(2000);
console.log('GROUPED BODY:', grouped.slice(0, 2200));
console.log('grouped mentions cycle:', /Parity Cycle|No cycle|无周期/i.test(grouped));
await snap('orvilo-team-issues-grouped-cycle');

await browser.close();
process.exit(0);
