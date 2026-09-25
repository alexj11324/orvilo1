// Orvilo task-detail FULL enumeration — same probes as the Linear side.
import { chromium } from 'playwright';
import fs from 'node:fs';

const OUT =
  '/Users/devin/repos/wt-parity-issue-detail/.agents/runtime-acceptance/parity-2026-09-23/issue-detail';
const URL = 'http://localhost:3010/agent-testing/task/PMI-1/urgent-review-release-evidence';
const log = (m) => {
  console.log(m);
  try {
    fs.appendFileSync(`${OUT}/audit-log.txt`, `a03 ${new Date().toISOString()} ${m}\n`);
  } catch {}
};

const browser = await chromium.connectOverCDP('http://localhost:9222', { timeout: 120000 });
const ctx = browser.contexts()[0];
let page = ctx.pages().find((p) => p.url().includes('localhost:3010'));
if (!page) page = ctx.pages().find((p) => p.url() === 'about:blank') || (await ctx.newPage());
await page.setViewportSize({ width: 1440, height: 900 });

const CONTROL_DUMP = `(() => {
  const els = [...document.querySelectorAll('button, [role="button"], a[href], [role="link"], [role="tab"], [role="checkbox"], [role="switch"], input, [contenteditable="true"], select, textarea, [aria-haspopup]')];
  const seen = new Set(); const out = [];
  for (const e of els) {
    if (seen.has(e)) continue; seen.add(e);
    const r = e.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const style = getComputedStyle(e);
    if (style.visibility === 'hidden' || style.display === 'none') continue;
    const svg = e.querySelector('svg');
    out.push({
      tag: e.tagName.toLowerCase(), role: e.getAttribute('role'),
      aria: e.getAttribute('aria-label'), haspopup: e.getAttribute('aria-haspopup'),
      text: (e.innerText || e.getAttribute('placeholder') || '').trim().slice(0, 80).replace(/\\n/g, ' | '),
      href: e.getAttribute('href')?.slice(0, 110),
      title: e.getAttribute('title') || e.closest('[title]')?.getAttribute('title'),
      x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
      ce: e.getAttribute('contenteditable'),
      svg: svg ? (svg.getAttribute('class') || svg.outerHTML.slice(0, 120)) : undefined,
    });
  }
  return out.sort((a, b) => a.y - b.y || a.x - b.x);
})()`;

const MENU_DUMP = `(() => {
  const roots = [...document.querySelectorAll('[role="menu"], [role="listbox"], [role="dialog"], .ant-dropdown, .ant-popover:not(.ant-popover-hidden), .ant-select-dropdown, [data-radix-popper-content-wrapper], [class*="popover" i]')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 10 && r.height > 10; });
  return roots.map(root => {
    const rect = root.getBoundingClientRect();
    const items = [...root.querySelectorAll('[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], [role="option"], [role="separator"], input, [class*="header" i], li, button, a[href], .ant-dropdown-menu-item, [class*="item" i]')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
    return {
      role: root.getAttribute('role'), cls: (root.className||'').toString().slice(0,60), x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height),
      items: items.slice(0, 80).map(e => ({
        role: e.getAttribute('role'), tag: e.tagName.toLowerCase(),
        text: (e.innerText || e.getAttribute('placeholder') || e.getAttribute('aria-label') || '').trim().slice(0, 120).replace(/\\n/g, ' | '),
        checked: e.getAttribute('aria-checked') ?? e.getAttribute('aria-selected'),
      })),
    };
  });
})()`;

const dump = async (tag) => {
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/${tag}.png` });
  const d = await page.evaluate(MENU_DUMP);
  fs.writeFileSync(`${OUT}/${tag}.json`, JSON.stringify(d, null, 1));
  log(`${tag}: roots=${d.length} items=${d.reduce((a, r) => a + r.items.length, 0)}`);
};

const clickAndDump = async (tag, locator) => {
  try {
    const el = locator.first();
    if (!(await el.count())) {
      log(`${tag}: NOT FOUND`);
      return false;
    }
    await el.click({ timeout: 5000 });
    await dump(tag);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    return true;
  } catch (e) {
    log(`${tag}: click err ${e.message.split('\n')[0]}`);
    return false;
  }
};

try {
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(10000);
  log('at ' + page.url());
  if (page.url().includes('/signin')) {
    log('REDIRECTED TO SIGNIN — abort');
    fs.writeFileSync(`${OUT}/done-a03.txt`, 'signin');
    process.exit(0);
  }
  await page.screenshot({ path: `${OUT}/orvilo-00-full.png` });

  const inv = await page.evaluate(CONTROL_DUMP);
  fs.writeFileSync(`${OUT}/orvilo-01-controls.json`, JSON.stringify(inv, null, 1));
  log(`controls=${inv.length}`);

  // Rail structure (right pane)
  const rail = await page.evaluate(`(() => {
    const els = [...document.querySelectorAll('button, a[href], [role="button"], [role="switch"], [class*="propertyItem"], [class*="railRow"]')]
      .filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.x > 990 && r.y > 60; });
    return els.map(e => { const r = e.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
        tag: e.tagName.toLowerCase(), cls: (e.className||'').toString().slice(0,50), aria: e.getAttribute('aria-label'), role: e.getAttribute('role'),
        text: (e.innerText || '').trim().slice(0, 60).replace(/\\n/g, ' | ') }; });
  })()`);
  fs.writeFileSync(`${OUT}/orvilo-30-rail-rows.json`, JSON.stringify(rail, null, 1));
  log(`rail=${rail.length}`);

  // Header right
  const header = await page.evaluate(`(() => {
    const els = [...document.querySelectorAll('button, a[href], [role="switch"], [role="button"]')]
      .filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.y < 60 && r.x > 230; });
    return els.map(e => ({ x: Math.round(e.getBoundingClientRect().x), y: Math.round(e.getBoundingClientRect().y),
      tag: e.tagName.toLowerCase(), aria: e.getAttribute('aria-label'), role: e.getAttribute('role'), title: e.getAttribute('title'),
      text: (e.innerText || '').trim().slice(0, 50) }));
  })()`);
  fs.writeFileSync(`${OUT}/orvilo-31-header.json`, JSON.stringify(header, null, 1));
  log(`header=${header.length}`);

  // --- Menus ---
  // status picker — the first property row
  await clickAndDump('orvilo-40-status', page.locator('[class*="propertyItem"]').first());
  await clickAndDump('orvilo-41-priority', page.locator('[class*="propertyItem"]').nth(1));
  await clickAndDump('orvilo-42-assignee', page.locator('[class*="propertyItem"]').nth(2));
  await clickAndDump(
    'orvilo-43-labels',
    page
      .locator('[class*="propertyItem"]:has-text("Label"), [class*="propertyItem"]:has(svg)')
      .nth(3),
  );
  // more menu — last header-right button (⋯)
  await clickAndDump(
    'orvilo-44-more',
    page
      .locator(
        'button:has(svg.lucide-ellipsis), button[aria-label*="more" i], button:has(svg.lucide-more-horizontal)',
      )
      .last(),
  );
  // schedule/automation row
  await clickAndDump('orvilo-45-schedule', page.locator('[class*="propertyItem"]').last());

  // Scroll to bottom → activity + composer
  await page.evaluate(() => {
    const cands = [...document.querySelectorAll('div, main')].filter(
      (e) => e.scrollHeight > e.clientHeight + 200 && e.clientHeight > 300,
    );
    const best = cands.sort((a, b) => b.scrollHeight - a.scrollHeight)[0];
    if (best) best.scrollTop = best.scrollHeight;
  });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/orvilo-50-activity-bottom.png` });
  const activityCtl = await page.evaluate(`(() => {
    const els = [...document.querySelectorAll('button, [role="button"], [role="tab"], [role="switch"], input, [contenteditable="true"], select')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.y > 300; });
    return els.map(e => ({ tag: e.tagName.toLowerCase(), role: e.getAttribute('role'), aria: e.getAttribute('aria-label'), title: e.getAttribute('title'),
      text: (e.innerText || e.getAttribute('placeholder') || '').trim().slice(0, 70).replace(/\\n/g, ' | '),
      x: Math.round(e.getBoundingClientRect().x), y: Math.round(e.getBoundingClientRect().y), w: Math.round(e.getBoundingClientRect().width) }));
  })()`);
  fs.writeFileSync(`${OUT}/orvilo-50-activity-ctl.json`, JSON.stringify(activityCtl, null, 1));
  log(`activity ctl=${activityCtl.length}`);
  log('done');
} catch (e) {
  log('ERR ' + e.message.split('\n')[0]);
}
fs.writeFileSync(`${OUT}/done-a03.txt`, 'done');
process.exit(0);
