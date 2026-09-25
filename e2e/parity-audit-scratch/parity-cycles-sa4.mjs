// Cycles audit — final pass: Filter popover (icon buttons by aria-label),
// list layout grouped by cycle.
import { chromium } from 'playwright';
import fs from 'node:fs';

const OUT = '/tmp/parity-cycles';
const PROFILE = '/tmp/orvilo-audit-profile';
fs.mkdirSync(OUT, { recursive: true });

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
const waitRich = async (minLen = 700, re = null) => {
  let last = '';
  for (let i = 0; i < 80; i++) {
    last = await page.evaluate(() => document.body.innerText).catch(() => '');
    if (last.length >= minLen && (!re || re.test(last))) return last;
    await page.waitForTimeout(3000);
  }
  return last;
};

// sanity: session should persist from pass-3 profile
await page.goto('http://localhost:3010/agent-testing/teams/team_cLY7tmARmiU6?tab=issues', {
  waitUntil: 'domcontentloaded',
});
const issues = await waitRich(700, /Issues|事项/i);
console.log('ISSUES len:', issues.length, '| URL:', page.url());
if (page.url().includes('signin')) {
  console.log('NOT LOGGED IN — abort');
  await ctx.close();
  process.exit(1);
}

// open Filter via aria-label
const filterBtn = page
  .locator('button[aria-label*="filter" i], [role="button"][aria-label*="filter" i]')
  .first();
console.log('filter aria btns:', await page.locator('[aria-label*="filter" i]').count());
await filterBtn.click().catch((e) => console.log('filter click fail', String(e).slice(0, 120)));
await page.waitForTimeout(2500);
const pop = await page.evaluate(() => document.body.innerText);
const popStart = pop.indexOf('Cycle') >= 0 ? Math.max(0, pop.indexOf('Cycle') - 600) : 0;
console.log('FILTER POP (around Cycle):', pop.slice(popStart, popStart + 2000));
console.log(
  'POP has "Cycle" row:',
  /(^|\n)Cycle\n/i.test(pop),
  '| All cycles:',
  /All cycles/.test(pop),
  '| Parity Cycle:',
  /Parity Cycle/.test(pop),
);
await snap('orvilo-filter-popover');

// open the Cycle select inside the popover to capture option list
const cycSelect = page.locator('[aria-label="Cycle"], .ant-select:has-text("All cycles")').first();
if (await cycSelect.count()) {
  await cycSelect.click().catch(() => {});
  await page.waitForTimeout(1200);
  const dd = await page.evaluate(() => document.body.innerText);
  console.log(
    'CYCLE DROPDOWN area:',
    dd.slice(Math.max(0, dd.indexOf('All cycles') - 200), dd.indexOf('All cycles') + 600),
  );
  await snap('orvilo-cycle-select-open');
  await page.keyboard.press('Escape');
} else {
  console.log('no cycle select found in popover');
}
await page.keyboard.press('Escape');
await page.waitForTimeout(400);

// Display options popover — grouping options incl. cycle
const dispBtn = page
  .locator('button[aria-label*="display" i], [aria-label*="Display options" i]')
  .first();
console.log('display aria btns:', await page.locator('[aria-label*="display" i]').count());
if (await dispBtn.count()) {
  await dispBtn.click();
  await page.waitForTimeout(2500);
  const dp = await page.evaluate(() => document.body.innerText);
  const gi = dp.search(/group|分组/i);
  console.log('DISPLAY POP (group area):', dp.slice(Math.max(0, gi - 200), gi + 1500));
  await snap('orvilo-display-popover');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
}

// list layout grouped by cycle
await page.goto(
  'http://localhost:3010/agent-testing/teams/team_cLY7tmARmiU6?tab=issues&layout=list&grouping=cycle',
  { waitUntil: 'domcontentloaded' },
);
const grouped = await waitRich(600);
await page.waitForTimeout(2500);
console.log('GROUPED-LIST BODY:', grouped.slice(0, 2500));
console.log(
  'GROUPED has Parity Cycle bucket:',
  /Parity Cycle/i.test(grouped),
  '| No cycle:',
  /No cycle/i.test(grouped),
);
await snap('orvilo-team-issues-grouped-cycle');

await ctx.close();
process.exit(0);
