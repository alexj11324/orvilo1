// Linear my-issues audit — READ ONLY. Opens menus, reads DOM, screenshots.
import { chromium } from 'playwright';

const SHOT = '/tmp/parity-my-issues';
import { mkdirSync } from 'node:fs';
mkdirSync(SHOT, { recursive: true });

const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
await page.setViewportSize({ width: 1440, height: 900 });

const shot = (name) => page.screenshot({ path: `${SHOT}/${name}.png` });
const log = (...a) => console.log(...a);

await page.goto('https://linear.app/bdiverifier/my-issues/assigned', {
  waitUntil: 'domcontentloaded',
});
await page.waitForTimeout(6000);
log('URL:', page.url(), '| TITLE:', await page.title());
await shot('linear-assigned');

// ---- 1. Header + tabs ----
const header = await page.evaluate(() => {
  const out = { buttons: [], tabs: [] };
  // tabs: role=tab or links inside header area
  document
    .querySelectorAll('[role="tab"], [role="tablist"] a, a[href*="/my-issues/"]')
    .forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.top < 200 && r.width > 0) {
        out.tabs.push({
          tag: el.tagName,
          role: el.getAttribute('role'),
          text: (el.textContent || '').trim().slice(0, 40),
          href: el.getAttribute('href'),
          ariaSelected: el.getAttribute('aria-selected'),
          cls: (el.className || '').toString().slice(0, 60),
          rect: {
            x: Math.round(r.x),
            y: Math.round(r.y),
            w: Math.round(r.width),
            h: Math.round(r.height),
          },
        });
      }
    });
  // header buttons — everything with aria-label in top ~120px
  document.querySelectorAll('button[aria-label], [role="button"][aria-label]').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.top < 120 && r.width > 0) {
      out.buttons.push({
        label: el.getAttribute('aria-label'),
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
log('=== TABS ===');
log(JSON.stringify(header.tabs, null, 1));
log('=== HEADER BUTTONS ===');
log(JSON.stringify(header.buttons, null, 1));

// ---- 2. Add filter menu ----
const filterBtn = page
  .locator('button[aria-label*="filter" i], [aria-label*="Add filter" i]')
  .first();
const fCount = await filterBtn.count();
log('filter btn count:', fCount);
if (fCount) {
  await filterBtn.click();
  await page.waitForTimeout(900);
  await shot('linear-add-filter');
  const menu = await page.evaluate(() => {
    const items = [];
    // find open menu/listbox
    document
      .querySelectorAll(
        '[role="menu"] [role="menuitem"], [role="listbox"] [role="option"], [role="dialog"] [role="menuitem"], [data-radix-popper-content-wrapper] [role="menuitem"], [class*="menu"] [role="option"]',
      )
      .forEach((el) => {
        items.push((el.textContent || '').trim().slice(0, 50));
      });
    const search = [...document.querySelectorAll('input')]
      .filter((i) => {
        const r = i.getBoundingClientRect();
        return r.top > 50 && r.top < 400 && r.width > 0;
      })
      .map((i) => ({
        ph: i.getAttribute('placeholder'),
        y: Math.round(i.getBoundingClientRect().top),
      }));
    return { items: items.slice(0, 40), search };
  });
  log('=== ADD FILTER MENU ===');
  log(JSON.stringify(menu, null, 1));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
}

// ---- 3. Display options ----
const dispBtn = page
  .locator(
    'button[aria-label*="isplay" i], [aria-label*="View options" i], button[aria-label*="view" i]',
  )
  .first();
log('display btn count:', await dispBtn.count());
// fallback: enumerate all icon buttons in the toolbar row and click the 2nd
const toolbarBtns = await page.evaluate(() =>
  [...document.querySelectorAll('button')]
    .filter((b) => {
      const r = b.getBoundingClientRect();
      return r.top > 20 && r.top < 130 && r.left > 900 && r.width > 0;
    })
    .map((b) => ({
      aria: b.getAttribute('aria-label'),
      text: (b.textContent || '').trim().slice(0, 30),
      x: Math.round(b.getBoundingClientRect().x),
    })),
);
log('toolbar right buttons:', JSON.stringify(toolbarBtns));

await page.close();
process.exit(0);
