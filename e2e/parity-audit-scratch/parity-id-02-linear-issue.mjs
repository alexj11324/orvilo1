// Stage B: land on ORV-115, inventory all controls, screenshot, open ⋯ menu.
import { chromium } from 'playwright';
import fs from 'node:fs';

const OUT = '/tmp/parity-audit-2026-09-23/issue-detail';
const log = (m) => fs.appendFileSync(`${OUT}/audit-log.txt`, `${new Date().toISOString()} ${m}\n`);

const INVENTORY_JS = `(() => {
  const els = [...document.querySelectorAll('a[href], button, [role="button"], [role="tab"], [role="menuitem"], [role="checkbox"], [role="switch"], [role="combobox"], input, [contenteditable="true"], [data-testid]')];
  return els.filter(e => {
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.y < 1400;
  }).map(e => ({
    tag: e.tagName.toLowerCase(),
    role: e.getAttribute('role'),
    text: (e.innerText || e.value || e.getAttribute('placeholder') || '').trim().slice(0, 80).replace(/\\n/g,' | '),
    aria: e.getAttribute('aria-label'),
    href: e.getAttribute('href'),
    testid: e.getAttribute('data-testid'),
    x: Math.round(e.getBoundingClientRect().x),
    y: Math.round(e.getBoundingClientRect().y),
    w: Math.round(e.getBoundingClientRect().width),
    h: Math.round(e.getBoundingClientRect().height),
  }));
})()`;

const MENU_DUMP_JS = `(() => {
  const items = [...document.querySelectorAll('[role="menu"] [role="menuitem"], [role="menu"] [role="menuitemcheckbox"], [role="menu"] [role="menuitemradio"], [role="menu"] [role="separator"], [role="menu"] [class*="label"], [role="menu"] input, [role="listbox"] [role="option"], [role="dialog"] [role="menuitem"], [role="dialog"] [role="option"], [data-radix-popper-content-wrapper] [role="menuitem"], [data-radix-popper-content-wrapper] [role="option"]')];
  const seen = new Set();
  return items.filter(e => { const r = e.getBoundingClientRect(); return r.width>0 && r.height>0; }).map(e => ({
    role: e.getAttribute('role'),
    text: (e.innerText || e.getAttribute('placeholder') || '').trim().slice(0, 120).replace(/\\n/g,' | '),
    aria: e.getAttribute('aria-label'),
    checked: e.getAttribute('aria-checked'),
    disabled: e.getAttribute('aria-disabled') || e.disabled || undefined,
    kbd: (e.querySelector('kbd')?.innerText || '').trim() || undefined,
  }));
})()`;

const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
await page.setViewportSize({ width: 1440, height: 900 });
log('B: tab opened');

try {
  await page.goto(
    'https://linear.app/bdiverifier/issue/ORV-115/slimming-15-remove-orphan-achaos-subsystem-and-chaos-fixtures',
    { waitUntil: 'domcontentloaded', timeout: 45000 },
  );
  await page.waitForTimeout(8000);
  await page.screenshot({ path: `${OUT}/linear-10-issue-top.png` });
  log('B: issue page captured');

  const inv = await page.evaluate(INVENTORY_JS);
  fs.writeFileSync(`${OUT}/linear-10-inventory.json`, JSON.stringify(inv, null, 1));
  log(`B: inventory ${inv.length}`);

  // scroll to bottom to capture activity/comments
  await page.evaluate(() => {
    const scroller = document.querySelector('main') || document.scrollingElement;
    (scroller || document.documentElement).scrollTop = 999999;
    window.scrollTo(0, 999999);
  });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/linear-11-issue-bottom.png` });
  await page.evaluate(() => window.scrollTo(0, 0));
  const sc = document.querySelector?.call ? null : null;
  await page.evaluate(() => {
    const m = document.querySelector('main');
    if (m) m.scrollTop = 0;
  });
  await page.waitForTimeout(800);

  // full text dump of main content for offline analysis
  const mainText = await page.evaluate(() => {
    const m = document.querySelector('main') || document.body;
    return m.innerText.slice(0, 12000);
  });
  fs.writeFileSync(`${OUT}/linear-10-maintext.txt`, mainText);

  // Open the ⋯ more-actions menu. Linear renders it as a button with
  // aria-label or an ellipsis icon in the header. Try several selectors.
  const moreBtn = page
    .locator(
      'button[aria-label*="more" i], button[aria-label*="Action" i], [aria-label*="issue options" i]',
    )
    .first();
  let opened = false;
  if ((await moreBtn.count()) && (await moreBtn.isVisible().catch(() => false))) {
    await moreBtn.click();
    opened = true;
  } else {
    // fallback: find header buttons and click the last icon-ish one (⋯)
    const cand = page.locator('header button, [role="banner"] button').last();
    if (await cand.count()) {
      await cand.click();
      opened = true;
    }
  }
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/linear-12-more-menu.png` });
  const menuItems = await page.evaluate(MENU_DUMP_JS);
  fs.writeFileSync(`${OUT}/linear-12-more-menu.json`, JSON.stringify(menuItems, null, 1));
  log(`B: more menu items=${menuItems.length} opened=${opened}`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
} catch (e) {
  log('B ERR ' + e.message);
}
fs.writeFileSync(`${OUT}/done-02.txt`, 'done');
process.exit(0);
