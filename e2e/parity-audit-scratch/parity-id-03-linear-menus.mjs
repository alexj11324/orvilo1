// Stage C: on ORV-115 — open ⋯ menu, status/priority/assignee/label pickers,
// scroll to activity section. All read-only; Escape after each.
import { chromium } from 'playwright';
import fs from 'node:fs';

const OUT = '/tmp/parity-audit-2026-09-23/issue-detail';
const log = (m) => fs.appendFileSync(`${OUT}/audit-log.txt`, `${new Date().toISOString()} ${m}\n`);

const MENU_DUMP_JS = `(() => {
  const roots = [...document.querySelectorAll('[role="menu"], [role="listbox"], [data-radix-popper-content-wrapper], [class*="popover" i]')].filter(e=>{const r=e.getBoundingClientRect();return r.width>10&&r.height>10;});
  const out = [];
  for (const root of roots) {
    const items = [...root.querySelectorAll('[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], [role="option"], [role="separator"], input, [class*="label" i], [class*="header" i], li, button')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0;});
    const rect = root.getBoundingClientRect();
    out.push({rootRole: root.getAttribute('role'), x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height), items: items.slice(0,60).map(e=>({
      role: e.getAttribute('role'), tag: e.tagName.toLowerCase(),
      text: (e.innerText || e.getAttribute('placeholder') || e.getAttribute('aria-label') || '').trim().slice(0,110).replace(/\\n/g,' | '),
      checked: e.getAttribute('aria-checked') ?? e.getAttribute('aria-selected'),
      disabled: e.getAttribute('aria-disabled') || (e.disabled===true?'true':undefined),
    }))});
  }
  return out;
})()`;

const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
await page.setViewportSize({ width: 1440, height: 900 });
log('C: tab opened');

const dumpAndShoot = async (tag) => {
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/${tag}.png` });
  const dump = await page.evaluate(MENU_DUMP_JS);
  fs.writeFileSync(`${OUT}/${tag}.json`, JSON.stringify(dump, null, 1));
  log(`${tag}: roots=${dump.length} items=${dump.reduce((a, r) => a + r.items.length, 0)}`);
};

try {
  await page.goto(
    'https://linear.app/bdiverifier/issue/ORV-115/slimming-15-remove-orphan-achaos-subsystem-and-chaos-fixtures',
    { waitUntil: 'domcontentloaded', timeout: 45000 },
  );
  await page.waitForTimeout(8000);

  // find real scroll container for the document
  const scrollInfo = await page.evaluate(() => {
    const cands = [...document.querySelectorAll('div, main')].filter(
      (e) => e.scrollHeight > e.clientHeight + 200 && e.clientHeight > 300,
    );
    return cands.slice(0, 8).map((e) => ({
      cls: (e.className || '').toString().slice(0, 80),
      sh: e.scrollHeight,
      ch: e.clientHeight,
    }));
  });
  fs.writeFileSync(`${OUT}/linear-scrollers.json`, JSON.stringify(scrollInfo, null, 1));

  // 1) ⋯ Issue options menu
  const moreBtn = page.locator('button[aria-label="Issue options"]').first();
  if (await moreBtn.count()) {
    await moreBtn.click();
    await dumpAndShoot('linear-20-more-menu');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  } else {
    log('C: no Issue options button');
  }

  // 2) Status picker — button whose text is "Done" in the rail
  const statusBtn = page.locator('button:has-text("Done")').last();
  if (await statusBtn.count()) {
    await statusBtn.click();
    await dumpAndShoot('linear-21-status-picker');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  }

  // 3) Priority picker — "High" button
  const prioBtn = page.locator('button:has-text("High")').last();
  if (await prioBtn.count()) {
    await prioBtn.click();
    await dumpAndShoot('linear-22-priority-picker');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  }

  // 4) Assignee — "Assign" button
  const assignBtn = page.locator('button:has-text("Assign")').last();
  if (await assignBtn.count()) {
    await assignBtn.click();
    await dumpAndShoot('linear-23-assignee-picker');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  }

  // 5) Add label
  const labelBtn = page
    .locator('button[aria-label="Add labels"], button:has-text("Add label")')
    .first();
  if (await labelBtn.count()) {
    await labelBtn.click();
    await dumpAndShoot('linear-24-label-picker');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  }

  // 6) Scroll to bottom of the issue scroll container → activity/comments
  await page.evaluate(() => {
    const cands = [...document.querySelectorAll('div, main')].filter(
      (e) => e.scrollHeight > e.clientHeight + 200 && e.clientHeight > 300,
    );
    const best = cands.sort((a, b) => b.scrollHeight - a.scrollHeight)[0];
    if (best) best.scrollTop = best.scrollHeight;
  });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/linear-25-activity-bottom.png` });
  const bottomInv = await page.evaluate(`(() => {
    const els = [...document.querySelectorAll('button, [role="button"], [role="tab"], [contenteditable="true"], a[href]')];
    return els.filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.y > 350; })
      .map(e => ({ tag: e.tagName.toLowerCase(), role: e.getAttribute('role'), aria: e.getAttribute('aria-label'),
        text: (e.innerText || e.getAttribute('placeholder') || '').trim().slice(0, 70).replace(/\\n/g,' | '),
        x: Math.round(e.getBoundingClientRect().x), y: Math.round(e.getBoundingClientRect().y) }));
  })()`);
  fs.writeFileSync(`${OUT}/linear-25-bottom-inv.json`, JSON.stringify(bottomInv, null, 1));
  log(`C: bottom inv=${bottomInv.length}`);
} catch (e) {
  log('C ERR ' + e.message);
}
fs.writeFileSync(`${OUT}/done-03.txt`, 'done');
process.exit(0);
