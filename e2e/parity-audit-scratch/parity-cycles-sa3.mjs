// Cycles audit — standalone pass 3: PERSISTENT profile, waits for rich content.
// Usage: node parity-cycles-sa3.mjs [login|audit]
import { chromium } from 'playwright';
import fs from 'node:fs';

const OUT = '/tmp/parity-cycles';
const PROFILE = '/tmp/orvilo-audit-profile';
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(PROFILE, { recursive: true });

const ctx = await chromium.launchPersistentContext(PROFILE, {
  headless: true,
  viewport: { width: 1440, height: 900 },
});
const page = ctx.pages()[0] || (await ctx.newPage());
page.setDefaultTimeout(90000);

const snap = (n) =>
  page.screenshot({ path: `${OUT}/${n}.png`, timeout: 60000 }).then(
    () => console.log('saved', n),
    (e) => console.log('shot failed', n, String(e).slice(0, 100)),
  );

const waitRich = async (minLen = 800, re = null) => {
  let last = '';
  for (let i = 0; i < 80; i++) {
    last = await page.evaluate(() => document.body.innerText).catch(() => '');
    if (last.length >= minLen && (!re || re.test(last))) return last;
    await page.waitForTimeout(3000);
  }
  return last;
};

const needLogin = async () => {
  await page.goto('http://localhost:3010/agent-testing/inbox', {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForTimeout(8000);
  return page.url().includes('/signin');
};

if (await needLogin()) {
  console.log('== needs login ==');
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
  for (let attempt = 1; attempt <= 4; attempt++) {
    console.log('attempt', attempt, 'url:', page.url());
    await dismissAgree();
    const email = page
      .locator('input[type="email"], input[name="email"], input[placeholder*="email" i]')
      .first();
    if (await email.count()) {
      await email.click();
      await page.waitForTimeout(400);
      await page.keyboard.type('agent-testing@orvilo.aspectlylabs.com', { delay: 15 });
      const got = await email.inputValue().catch(() => '');
      console.log('email=', got);
      if (!got.includes('agent-testing')) {
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(6000);
        continue;
      }
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
      await page.waitForTimeout(7000);
      console.log('post-next url:', page.url());
      const pwd = page.locator('input[type="password"]').first();
      if (await pwd.count()) {
        await pwd.click();
        await page.keyboard.type('TestPassword123!', { delay: 15 });
        const gotP = await pwd.inputValue().catch(() => '');
        console.log('pwd len:', gotP.length);
        await page
          .getByRole('button', { name: /sign in|log in|登录|submit|next|继续/i })
          .first()
          .click();
        await page.waitForTimeout(10000);
      }
    }
    if (!page.url().includes('/signin')) break;
    await page.waitForTimeout(3000);
  }
  console.log('LOGIN END URL:', page.url());
} else {
  console.log('== already logged in ==');
}

// ── sidebar inventory ───────────────────────────────────────────────────────
await page.goto('http://localhost:3010/agent-testing/inbox', {
  waitUntil: 'domcontentloaded',
});
const inbox = await waitRich(600);
console.log('INBOX len:', inbox.length, '| URL:', page.url());
const navDump = await page.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll(
    'a,button,[role="treeitem"],[role="link"],[role="button"]',
  )) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.x < 320 && r.width <= 320 && r.y > 30) {
      const t = (el.innerText || el.getAttribute('aria-label') || '').trim();
      if (t && t.length < 60) out.push({ t: t.slice(0, 50), tag: el.tagName, y: Math.round(r.y) });
    }
  }
  return out;
});
console.log('LEFT-RAIL:', JSON.stringify(navDump));
console.log(
  'CYCLE-ISH:',
  JSON.stringify(navDump.filter((r) => /cycle|initiative|try|周期|倡议/i.test(r.t))),
);
await snap('orvilo-sidebar-loaded');

// ── /agent-testing/cycles ───────────────────────────────────────────────────
await page.goto('http://localhost:3010/agent-testing/cycles', { waitUntil: 'domcontentloaded' });
const cycBody = await waitRich(300);
console.log('CYCLES final URL:', page.url());
console.log('CYCLES BODY head:', cycBody.slice(0, 600));
await snap('orvilo-cycles-route-loaded');

// ── team issues ─────────────────────────────────────────────────────────────
await page.goto('http://localhost:3010/agent-testing/teams/team_cLY7tmARmiU6?tab=issues', {
  waitUntil: 'domcontentloaded',
});
const issues = await waitRich(700, /filter|筛选|status|状态|cycle|周期|all|全部/i);
console.log('ISSUES len:', issues.length, '| URL:', page.url());
console.log('ISSUES BODY:', issues.slice(0, 2500));
await snap('orvilo-team-issues-loaded');

const fb = page.locator('button').filter({ hasText: /filter|筛选/i });
console.log('filter btn count:', await fb.count());
if (await fb.count()) {
  await fb.first().click();
  await page.waitForTimeout(2000);
  const pop = await page.evaluate(() => document.body.innerText);
  console.log('FILTER POP:', pop.slice(0, 3000));
  console.log(
    'POP has Cycle:',
    /cycle|周期/i.test(pop),
    '| Parity Cycle:',
    /Parity Cycle/i.test(pop),
  );
  await snap('orvilo-filter-popover');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
}

const db = page.locator('button').filter({ hasText: /display|显示/i });
console.log('display btn count:', await db.count());
if (await db.count()) {
  await db.first().click();
  await page.waitForTimeout(2000);
  const dp = await page.evaluate(() => document.body.innerText);
  console.log('DISPLAY POP:', dp.slice(0, 3000));
  console.log('DISPLAY has cycle grouping:', /cycle|周期/i.test(dp));
  await snap('orvilo-display-popover');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
}

// ── cycle deep-link ─────────────────────────────────────────────────────────
await page.goto(
  'http://localhost:3010/agent-testing/teams/team_cLY7tmARmiU6?tab=issues&cycle=e02776ed-2d86-4b47-b6d5-fcb3b79d7114',
  { waitUntil: 'domcontentloaded' },
);
const filtered = await waitRich(500);
await page.waitForTimeout(2000);
console.log('FILTERED BODY:', filtered.slice(0, 2200));
console.log('FILTERED has Parity Cycle:', /Parity Cycle/i.test(filtered));
await snap('orvilo-team-issues-cycle');

// ── grouped by cycle board ──────────────────────────────────────────────────
await page.goto(
  'http://localhost:3010/agent-testing/teams/team_cLY7tmARmiU6?tab=issues&layout=board&grouping=cycle',
  { waitUntil: 'domcontentloaded' },
);
const grouped = await waitRich(500);
await page.waitForTimeout(2000);
console.log('GROUPED BODY:', grouped.slice(0, 2200));
console.log('GROUPED cycle mentions:', /Parity Cycle|No cycle|无周期/i.test(grouped));
await snap('orvilo-team-issues-grouped-cycle');

await ctx.close();
process.exit(0);
