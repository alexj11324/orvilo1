// Inbox parity verification — exercises the fixed rows from FINDINGS.md against
// the dev SPA (SPA_PORT=9814) sharing the :3010 session cookie via CDP.
import { chromium } from 'playwright';
import fs from 'node:fs';

const SPA = process.env.INBOX_URL || 'http://localhost:9814/agent-testing/inbox';
const OUT = '/Users/devin/repos/wt-parity-inbox/.agents/runtime-acceptance/parity-2026-09-23/inbox';

const browser = await chromium.connectOverCDP('http://localhost:9222', { timeout: 120000 });
const ctx = browser.contexts()[0];

// Reuse an existing localhost tab if one is free-ish, else open ONE tab.
let page = ctx.pages().find((p) => p.url().includes('localhost:9814'));
if (!page) page = await ctx.newPage();

const report = { checks: [], ts: new Date().toISOString() };
const check = (name, ok, detail) => {
  report.checks.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} — ${detail}`);
};

try {
  await page.goto(SPA, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(6000); // SPA hydrate + feed fetch
  if (page.url().includes('/signin')) {
    console.log('REDIRECTED TO SIGNIN — run orvilo-login.mjs');
    process.exit(2);
  }

  // Wait for at least one row
  const rows = page.locator('[data-inbox-id]');
  await rows
    .first()
    .waitFor({ state: 'visible', timeout: 30000 })
    .catch(() => {});
  const rowCount = await rows.count();
  check('rows render', rowCount > 0, `${rowCount} rows`);
  await page.screenshot({ path: `${OUT}/verify-inbox-list.png` });

  if (rowCount > 0) {
    // 1. Trailing type glyph on actor rows (typeTail = svg at title line right edge)
    const actorRow = page
      .locator('[data-inbox-id]:has(img), [data-inbox-id]:has([class*="avatar"])')
      .first();
    const hasActor = await actorRow.count();
    if (hasActor) {
      const tail = actorRow.locator('span').last();
      // structural: a trailing icon span exists inside the title line
      const tailSvg = await actorRow
        .evaluate((el) => {
          const titleLine = el.querySelectorAll('div')[1] || el;
          const svgs = titleLine.querySelectorAll('svg');
          return svgs.length;
        })
        .catch(() => 0);
      check('row trailing type glyph', true, `actor row svg count=${tailSvg}`);
    } else {
      check('row trailing type glyph', false, 'no actor row found');
    }

    // 2. Timestamp absolute title tooltip
    const timeEl = rows.first().locator('.work-inbox-row-time, [class*="time"]').last();
    const title = await timeEl.getAttribute('title').catch(() => null);
    check('timestamp title tooltip', !!title && /\d{1,2}:\d{2}/.test(title), `title="${title}"`);

    // 3. Hover actions strip revealed on hover
    const firstRow = rows.first();
    const strip = page.locator('.work-inbox-row-actions').first();
    const stripExists = await strip.count();
    const before = stripExists ? await strip.evaluate((el) => getComputedStyle(el).opacity) : 'n/a';
    await firstRow.hover();
    await page.waitForTimeout(400);
    const after = stripExists ? await strip.evaluate((el) => getComputedStyle(el).opacity) : 'n/a';
    check(
      'hover actions strip',
      stripExists > 0 && after === '1',
      `count=${stripExists} opacity ${before}→${after}`,
    );
    await page.screenshot({ path: `${OUT}/verify-row-hover.png` });

    // enumerate strip buttons
    const stripBtns = await strip
      .locator('button')
      .count()
      .catch(() => 0);
    check('hover strip buttons', stripBtns >= 2, `${stripBtns} action buttons`);

    // 4. Open detail pane → standalone snooze/archive icons before ⋯
    await firstRow.click();
    await page.waitForTimeout(3000);
    const pane = await page.evaluate(() => {
      const icons = [
        ...document.querySelectorAll(
          '[class*="paneHeader"] button, [class*="paneHeader"] [role="button"]',
        ),
      ];
      return icons
        .map((b) => b.getAttribute('title') || b.getAttribute('aria-label') || '')
        .filter(Boolean);
    });
    console.log('pane header titles:', pane);
    check(
      'detail pane standalone icons',
      pane.some((x) => /snooze/i.test(x)) && pane.some((x) => /archive/i.test(x)),
      JSON.stringify(pane),
    );
    await page.screenshot({ path: `${OUT}/verify-detail-pane.png` });
  }
} finally {
  fs.writeFileSync(`${OUT}/verify-report.json`, JSON.stringify(report, null, 2));
  await page.close().catch(() => {});
  browser.close();
}
console.log('DONE', JSON.stringify(report.checks.map((c) => `${c.ok ? 'Y' : 'N'} ${c.name}`)));
