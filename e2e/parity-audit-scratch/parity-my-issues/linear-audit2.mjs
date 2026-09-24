// Linear my-issues audit part 2 — READ ONLY. Display options, rows, hover, context menu, tabs.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const SHOT = '/tmp/parity-my-issues';
mkdirSync(SHOT, { recursive: true });

const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
await page.setViewportSize({ width: 1440, height: 900 });
const shot = (n) => page.screenshot({ path: `${SHOT}/${n}.png` });
const log = (...a) => console.log(...a);

const dumpMenu = async (tag) => {
  const menu = await page.evaluate(() => {
    const grab = (root) =>
      [
        ...root.querySelectorAll(
          '[role="menuitem"], [role="option"], [role="menuitemcheckbox"], [role="menuitemradio"], [role="switch"], button, [role="slider"], input',
        ),
      ]
        .map((el) => {
          const r = el.getBoundingClientRect();
          if (r.width === 0) return null;
          return {
            role: el.getAttribute('role') || el.tagName.toLowerCase(),
            text: (el.textContent || '').trim().slice(0, 60),
            checked:
              el.getAttribute('aria-checked') ?? el.getAttribute('aria-expanded') ?? undefined,
            disabled: el.getAttribute('aria-disabled') ?? (el.disabled ? 'true' : undefined),
          };
        })
        .filter(Boolean);
    const roots = [
      ...document.querySelectorAll('[role="menu"], [role="listbox"], [role="dialog"]'),
    ];
    const last = roots.at(-1);
    return last ? grab(last) : [];
  });
  log(`=== ${tag} ===`);
  log(JSON.stringify(menu, null, 1));
};

await page.goto('https://linear.app/bdiverifier/my-issues/assigned', {
  waitUntil: 'domcontentloaded',
});
await page.waitForTimeout(6000);

// ---- Display options menu ----
await page.locator('button[aria-label="Display options"]').first().click();
await page.waitForTimeout(900);
await shot('linear-display-options');
await dumpMenu('DISPLAY OPTIONS (assigned)');
await page.keyboard.press('Escape');
await page.waitForTimeout(400);

// ---- Row anatomy: first row DOM ----
const rowInfo = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('a[href*="/issue/"]')];
  const first = rows[0];
  if (!first) return { error: 'no rows' };
  const row = first.closest('[class*="row"], li, [role="row"]') || first;
  const dump = (el, depth = 0) => {
    if (depth > 4 || !el) return null;
    const r = el.getBoundingClientRect?.();
    return {
      tag: el.tagName?.toLowerCase(),
      aria: el.getAttribute?.('aria-label'),
      text: depth <= 1 ? (el.textContent || '').trim().slice(0, 80) : undefined,
      kids: [...el.children].slice(0, 12).map((c) => dump(c, depth + 1)),
    };
  };
  // group headers above
  const headers = [];
  document.querySelectorAll('[class*="group"], h2, h3').forEach(() => {});
  return { rowHtml: row.outerHTML.slice(0, 3000) };
});
log('=== FIRST ROW HTML (truncated) ===');
log(rowInfo.rowHtml?.slice(0, 2500));

// group headers — look for buttons containing counts
const groupHeaders = await page.evaluate(() => {
  const out = [];
  document.querySelectorAll('button').forEach((b) => {
    const r = b.getBoundingClientRect();
    const t = (b.textContent || '').trim();
    if (r.top > 120 && r.top < 900 && r.width > 400 && t.length < 60) {
      out.push({
        text: t.slice(0, 60),
        y: Math.round(r.top),
        h: Math.round(r.height),
        expanded: b.getAttribute('aria-expanded'),
      });
    }
  });
  return out;
});
log('=== GROUP HEADERS (assigned) ===');
log(JSON.stringify(groupHeaders));

// ---- Row hover: what controls appear ----
const firstRow = page.locator('a[href*="/issue/"]').first();
await firstRow.hover();
await page.waitForTimeout(600);
await shot('linear-row-hover');
const hoverControls = await page.evaluate(() => {
  const out = [];
  document
    .querySelectorAll('a[href*="/issue/"]')[0]
    ?.closest('div')
    ?.parentElement?.querySelectorAll('button, [role="button"], [role="checkbox"]')
    .forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width > 0)
        out.push({
          aria: el.getAttribute('aria-label'),
          text: (el.textContent || '').trim().slice(0, 30),
          role: el.getAttribute('role'),
        });
    });
  return out;
});
log('=== ROW HOVER CONTROLS ===');
log(JSON.stringify(hoverControls));

// ---- Right-click context menu on first row ----
await firstRow.click({ button: 'right' });
await page.waitForTimeout(900);
await shot('linear-context-menu');
await dumpMenu('CONTEXT MENU');
await page.keyboard.press('Escape');
await page.waitForTimeout(400);

// ---- Status icon click (inline edit) ----
// find the status button inside first row
const statusBtn = page
  .locator('a[href*="/issue/"]')
  .first()
  .locator('xpath=ancestor::*[self::li or @role="row" or contains(@class,"row")][1]')
  .locator('button')
  .first();
log('statusBtn count:', await statusBtn.count());
if (await statusBtn.count()) {
  await statusBtn.click();
  await page.waitForTimeout(900);
  await shot('linear-status-picker');
  await dumpMenu('STATUS PICKER');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
}

// ---- Multi-select: cmd+click two rows ----
const allRows = page.locator('a[href*="/issue/"]');
const rowCount = await allRows.count();
log('issue anchors:', rowCount);
if (rowCount >= 3) {
  await allRows.nth(0).click({ modifiers: ['Meta'] });
  await allRows.nth(1).click({ modifiers: ['Meta'] });
  await page.waitForTimeout(900);
  await shot('linear-multiselect');
  const bulkBar = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('button, [role="button"], [role="menuitem"]').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.top > 700 && r.width > 0) {
        out.push({
          aria: el.getAttribute('aria-label'),
          text: (el.textContent || '').trim().slice(0, 40),
          y: Math.round(r.top),
        });
      }
    });
    return out;
  });
  log('=== BULK BAR (bottom) ===');
  log(JSON.stringify(bulkBar));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
}

await page.close();
process.exit(0);
