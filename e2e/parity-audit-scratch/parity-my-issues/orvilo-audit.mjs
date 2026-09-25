// Orvilo my-issues audit — :3010 production build. Mutations allowed but restore.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const SHOT = '/tmp/parity-my-issues';
mkdirSync(SHOT, { recursive: true });

const BASE = process.env.ORVILO_URL || 'http://localhost:3010';
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
          '[role="menuitem"], [role="option"], [role="menuitemcheckbox"], [role="menuitemradio"], [role="switch"], button, input, [class*="switch"]',
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
          };
        })
        .filter(Boolean);
    const roots = [
      ...document.querySelectorAll(
        '[role="menu"], [role="listbox"], [role="dialog"], [class*="popover"], [data-popup-open]',
      ),
    ];
    return roots.map((r, i) => ({
      root: i,
      cls: (r.className || '').toString().slice(0, 50),
      items: grab(r).slice(0, 60),
    }));
  });
  log(`=== ${tag} ===`);
  log(JSON.stringify(menu, null, 1));
};

await page
  .goto(`${BASE}/agent-testing/my-issues`, { waitUntil: 'commit', timeout: 60000 })
  .catch((e) => log('goto warn:', e.message));
await page.waitForTimeout(12000);
log('URL:', page.url(), '| TITLE:', await page.title());
await shot('orvilo-assigned');

// ---- Header + tabs ----
const header = await page.evaluate(() => {
  const out = { tabs: [], buttons: [] };
  document.querySelectorAll('[role="tab"], [role="tablist"] *').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.top < 200 && r.width > 0 && el.getAttribute('role') === 'tab') {
      out.tabs.push({
        text: (el.textContent || '').trim().slice(0, 40),
        ariaSelected: el.getAttribute('aria-selected'),
        rect: {
          x: Math.round(r.x),
          y: Math.round(r.y),
          w: Math.round(r.width),
          h: Math.round(r.height),
        },
      });
    }
  });
  document
    .querySelectorAll('button[aria-label], [role="button"][aria-label], [title]')
    .forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.top < 130 && r.width > 0) {
        out.buttons.push({
          label: el.getAttribute('aria-label') || el.getAttribute('title'),
          text: (el.textContent || '').trim().slice(0, 40),
          rect: {
            x: Math.round(r.x),
            y: Math.round(r.y),
            w: Math.round(r.width),
            h: Math.round(r.height),
          },
        });
      }
    });
  return out;
});
log('=== ORVILO TABS ===');
log(JSON.stringify(header.tabs, null, 1));
log('=== ORVILO HEADER BUTTONS ===');
log(JSON.stringify(header.buttons, null, 1));

// ---- Add filter ----
const filterBtn = page.locator('button[aria-label*="filter" i]').last();
log('filter btns:', await page.locator('button[aria-label*="filter" i]').count());
if (await filterBtn.count()) {
  await filterBtn.click();
  await page.waitForTimeout(900);
  await shot('orvilo-add-filter');
  await dumpMenu('ORVILO ADD FILTER');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
}

// ---- Display options ----
const dispBtn = page.locator('button[aria-label*="isplay" i], button[title*="isplay" i]').last();
log('display btns:', await dispBtn.count());
if (await dispBtn.count()) {
  await dispBtn.click();
  await page.waitForTimeout(900);
  await shot('orvilo-display-options');
  await dumpMenu('ORVILO DISPLAY OPTIONS');
  // also grab raw text of the popover for toggle labels
  const popText = await page.evaluate(() => {
    const pops = [...document.querySelectorAll('[class*="popover"], [role="dialog"]')];
    return pops.map((p) => (p.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 800));
  });
  log('POPOVER TEXT:', JSON.stringify(popText));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
}

// ---- Rows + group headers ----
const groupHeaders = await page.evaluate(() => {
  const out = [];
  document.querySelectorAll('button[aria-expanded]').forEach((b) => {
    const r = b.getBoundingClientRect();
    if (r.top > 100 && r.width > 200) {
      out.push({
        text: (b.textContent || '').trim().slice(0, 60),
        y: Math.round(r.top),
        expanded: b.getAttribute('aria-expanded'),
      });
    }
  });
  return out;
});
log('=== ORVILO GROUP HEADERS ===');
log(JSON.stringify(groupHeaders));

const rowHtml = await page.evaluate(() => {
  const row = document.querySelector('[data-bulk-row-id]');
  return row ? row.outerHTML.slice(0, 3500) : 'NO ROW';
});
log('=== ORVILO FIRST ROW HTML ===');
log(rowHtml.slice(0, 3000));

// ---- hover first row ----
const firstRow = page.locator('[data-bulk-row-id]').first();
if (await firstRow.count()) {
  await firstRow.hover();
  await page.waitForTimeout(600);
  await shot('orvilo-row-hover');
}

// ---- right-click context menu ----
if (await firstRow.count()) {
  await firstRow.click({ button: 'right' });
  await page.waitForTimeout(900);
  await shot('orvilo-context-menu');
  await dumpMenu('ORVILO CONTEXT MENU');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
}

// ---- status icon click ----
const statusBtn = firstRow.locator('button').first();
if (await statusBtn.count()) {
  await statusBtn.click();
  await page.waitForTimeout(900);
  await shot('orvilo-status-picker');
  await dumpMenu('ORVILO STATUS PICKER');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
}

// ---- multi-select via cmd+click ----
const rows = page.locator('[data-bulk-row-id]');
const rc = await rows.count();
log('orvilo rows:', rc);
if (rc >= 3) {
  await rows.nth(0).click({ modifiers: ['Meta'] });
  await page.waitForTimeout(300);
  await rows.nth(1).click({ modifiers: ['Meta'] });
  await page.waitForTimeout(900);
  await shot('orvilo-multiselect');
  const bulkBar = await page.evaluate(() => {
    const out = [];
    document
      .querySelectorAll('[data-bulk-actions] button, [data-bulk-actions] [role="button"]')
      .forEach((el) => {
        out.push({
          aria: el.getAttribute('aria-label') || el.getAttribute('title'),
          text: (el.textContent || '').trim().slice(0, 40),
        });
      });
    return out;
  });
  log('=== ORVILO BULK BAR ===');
  log(JSON.stringify(bulkBar));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
}

await page.close();
process.exit(0);
