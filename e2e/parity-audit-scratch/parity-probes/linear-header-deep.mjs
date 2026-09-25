import { connect } from './cdp-connect.mjs';
import fs from 'fs';
const DIR = '/tmp/parity-project-detail';
const browser = await connect();
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
const result = {};
const dump = (k, v) => {
  result[k] = v;
  fs.writeFileSync(`${DIR}/linear-header-deep.json`, JSON.stringify(result, null, 1));
};
const shot = (n) => page.screenshot({ path: `${DIR}/${n}.png` }).catch(() => {});
const menus = async () =>
  page.evaluate(() =>
    [
      ...document.querySelectorAll(
        '[role="menu"],[role="listbox"],[role="dialog"],[data-radix-popper-content-wrapper],[class*="popover" i]',
      ),
    ]
      .map((el) => ({
        cls: (el.className || '').toString().slice(0, 60),
        text: el.innerText.slice(0, 800),
      }))
      .filter((m) => m.text),
  );
try {
  await page.goto(
    'https://linear.app/bdiverifier/project/orvilo-linear-parity-3eb13143d468/overview',
    { waitUntil: 'domcontentloaded' },
  );
  await page.waitForTimeout(9000);

  // 1. project-glyph "Menu" button (x253,y17)
  try {
    await page.locator('button[aria-label="Menu"]').first().click({ timeout: 8000 });
    await page.waitForTimeout(1200);
    dump('glyphMenu', await menus());
    await shot('linear-glyph-menu');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  } catch (e) {
    dump('glyphMenuErr', e.message.slice(0, 150));
  }

  // 2. Add new view "+" (x466,y61)
  try {
    await page.locator('button[aria-label="Add new view"]').first().click({ timeout: 8000 });
    await page.waitForTimeout(1200);
    dump('addViewMenu', await menus());
    await shot('linear-add-view-menu');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  } catch (e) {
    dump('addViewErr', e.message.slice(0, 150));
  }

  // 3. Copy page URL — check clipboard permission; click and capture toast
  try {
    await ctx
      .grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'https://linear.app' })
      .catch(() => {});
    await page.locator('button[aria-label="Copy page URL"]').first().click({ timeout: 8000 });
    await page.waitForTimeout(1200);
    const clip = await page.evaluate(() =>
      navigator.clipboard.readText().catch((e) => 'denied:' + e.message),
    );
    const toast = await page.evaluate(() =>
      [...document.querySelectorAll('[role="status"],[class*="toast" i],[class*="Toast" i]')]
        .map((e) => e.innerText.slice(0, 120))
        .filter(Boolean)
        .slice(0, 5),
    );
    dump('copyUrl', { clip, toast });
    await shot('linear-copy-url');
  } catch (e) {
    dump('copyErr', e.message.slice(0, 150));
  }

  // 4. Setup project notifications
  try {
    await page
      .locator('button[aria-label="Setup project notifications"]')
      .first()
      .click({ timeout: 8000 });
    await page.waitForTimeout(1200);
    dump('notifMenu', await menus());
    await shot('linear-notif-menu');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  } catch (e) {
    dump('notifErr', e.message.slice(0, 150));
  }

  // 5. Close project details — DON'T click (navigates away; note presence only)
  // Instead capture title tooltip
  const closeTitle = await page
    .locator('button[aria-label="Close project details"]')
    .first()
    .getAttribute('title')
    .catch(() => null);
  dump('closeTitle', closeTitle);
} catch (e) {
  dump('fatal', e.message.slice(0, 600));
}
fs.writeFileSync(`${DIR}/linear-header-deep.json`, JSON.stringify(result, null, 1));
process.exit(0);
