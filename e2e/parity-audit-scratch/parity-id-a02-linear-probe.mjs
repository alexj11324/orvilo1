// Linear probe #2: rail DOM structure, real Issue options menu, estimate/due-date
// presence, title/description editor affordances, activity + composer anatomy.
import { chromium } from 'playwright';
import fs from 'node:fs';

const OUT =
  '/Users/devin/repos/wt-parity-issue-detail/.agents/runtime-acceptance/parity-2026-09-23/issue-detail';
const URL =
  'https://linear.app/bdiverifier/issue/ORV-115/slimming-15-remove-orphan-achaos-subsystem-and-chaos-fixtures';
const log = (m) => {
  console.log(m);
  try {
    fs.appendFileSync(`${OUT}/audit-log.txt`, `a02 ${new Date().toISOString()} ${m}\n`);
  } catch {}
};

const browser = await chromium.connectOverCDP('http://localhost:9222', { timeout: 120000 });
const ctx = browser.contexts()[0];
let page = ctx.pages().find((p) => p.url().includes('linear.app'));
if (!page) page = await ctx.newPage();
await page.setViewportSize({ width: 1440, height: 900 });

const MENU_DUMP = `(() => {
  const roots = [...document.querySelectorAll('[role="menu"], [role="listbox"], [role="dialog"], [data-radix-popper-content-wrapper], [class*="popover" i]')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 10 && r.height > 10; });
  return roots.map(root => {
    const rect = root.getBoundingClientRect();
    const items = [...root.querySelectorAll('[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], [role="option"], [role="separator"], input, [class*="header" i], li, button, a[href]')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
    return {
      role: root.getAttribute('role'), x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height),
      items: items.slice(0, 80).map(e => ({
        role: e.getAttribute('role'), tag: e.tagName.toLowerCase(),
        text: (e.innerText || e.getAttribute('placeholder') || e.getAttribute('aria-label') || '').trim().slice(0, 120).replace(/\\n/g, ' | '),
        checked: e.getAttribute('aria-checked') ?? e.getAttribute('aria-selected'),
        kbd: e.querySelector('kbd, [class*="shortcut" i]')?.innerText?.trim()?.slice(0, 30),
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

try {
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(9000);
  log('at ' + page.url());

  // ---- Rail structure: find the properties column (right side ~x>1000) ----
  const rail = await page.evaluate(`(() => {
    // find buttons/links in the right pane and their row labels
    const els = [...document.querySelectorAll('button, a[href], [role="button"], [role="switch"]')]
      .filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.x > 990 && r.x < 1440 && r.y > 100; });
    return els.map(e => {
      const r = e.getBoundingClientRect();
      // row label = nearest preceding text node in the row container
      let row = e.closest('div');
      let label = '';
      for (let i = 0; i < 4 && row; i++) { row = row.parentElement; const t = (row?.innerText || '').trim(); if (t && t.length < 200) label = t; }
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
        tag: e.tagName.toLowerCase(), aria: e.getAttribute('aria-label'), role: e.getAttribute('role'),
        text: (e.innerText || '').trim().slice(0, 60).replace(/\\n/g, ' | '), rowCtx: (label || '').slice(0, 120).replace(/\\n/g, ' | ') };
    });
  })()`);
  fs.writeFileSync(`${OUT}/linear-30-rail-rows.json`, JSON.stringify(rail, null, 1));
  log(`rail els=${rail.length}`);

  // ---- Header right cluster: exact order + tooltips ----
  const header = await page.evaluate(`(() => {
    const els = [...document.querySelectorAll('button, a[href], [role="switch"], [role="button"]')]
      .filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.y < 80 && r.x > 230; });
    return els.map(e => ({ x: Math.round(e.getBoundingClientRect().x), y: Math.round(e.getBoundingClientRect().y),
      tag: e.tagName.toLowerCase(), aria: e.getAttribute('aria-label'), role: e.getAttribute('role'),
      text: (e.innerText || '').trim().slice(0, 50) }));
  })()`);
  fs.writeFileSync(`${OUT}/linear-31-header-right.json`, JSON.stringify(header, null, 1));
  log(`header els=${header.length}`);

  // ---- Real Issue options menu (the one in the header) ----
  const issueOptions = page.locator('button[aria-label="Issue options"]').first();
  if (await issueOptions.count()) {
    await issueOptions.click();
    await dump('linear-32-issue-options');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  }

  // ---- "Choose coding tool" dropdown ----
  const codingTool = page.locator('button[aria-label="Choose coding tool"]').first();
  if (await codingTool.count()) {
    await codingTool.click();
    await dump('linear-33-coding-tool');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  }

  // ---- ORV-115 breadcrumb chip — is it a link or a menu? ----
  const chip = await page.evaluate(`(() => {
    const a = [...document.querySelectorAll('a, button')].find(e => (e.innerText||'').includes('ORV-115') && e.getBoundingClientRect().y < 60);
    if (!a) return null;
    return { tag: a.tagName.toLowerCase(), href: a.getAttribute('href'), role: a.getAttribute('role'), haspopup: a.getAttribute('aria-haspopup'), html: a.outerHTML.slice(0, 500) };
  })()`);
  fs.writeFileSync(`${OUT}/linear-34-idchip.json`, JSON.stringify(chip, null, 1));

  // ---- estimate/due date presence: search whole doc for the rows ----
  const propCheck = await page.evaluate(`(() => {
    const texts = ['Estimate', 'Due date', 'Cycle', 'Project', 'Milestone', 'Labels', 'Priority', 'Status', 'Assignee'];
    const hits = {};
    for (const t of texts) {
      const el = [...document.querySelectorAll('span, div, label, button')].find(e => e.childElementCount < 4 && (e.innerText||'').trim() === t && e.getBoundingClientRect().width > 0);
      hits[t] = el ? { x: Math.round(el.getBoundingClientRect().x), y: Math.round(el.getBoundingClientRect().y) } : null;
    }
    return hits;
  })()`);
  fs.writeFileSync(`${OUT}/linear-35-prop-check.json`, JSON.stringify(propCheck, null, 1));
  log('propCheck ' + JSON.stringify(propCheck));

  // ---- Description: hover to reveal toolbar? Focus it. ----
  const desc = page.locator('[aria-label="Issue description"]').first();
  if (await desc.count()) {
    await desc.hover();
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${OUT}/linear-40-desc-hover.png` });
    // click at start of desc to place caret — read-only for text (just focuses)
    const tb = await page.evaluate(`(() => {
      const els = [...document.querySelectorAll('button, [role="button"], [role="toolbar"]')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.y > 150 && r.y < 400 && r.x > 230 && r.x < 1000; });
      return els.map(e => ({ aria: e.getAttribute('aria-label'), text: (e.innerText||'').trim().slice(0,40), x: Math.round(e.getBoundingClientRect().x), y: Math.round(e.getBoundingClientRect().y) }));
    })()`);
    fs.writeFileSync(`${OUT}/linear-40-desc-hover.json`, JSON.stringify(tb, null, 1));
  }

  // ---- Scroll to activity: unsubscribers + comment composer + filter ----
  await page.evaluate(() => {
    const cands = [...document.querySelectorAll('div, main')].filter(
      (e) => e.scrollHeight > e.clientHeight + 200 && e.clientHeight > 300,
    );
    const best = cands.sort((a, b) => b.scrollHeight - a.scrollHeight)[0];
    if (best) best.scrollTop = best.scrollHeight;
  });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/linear-50-activity-bottom.png` });
  const activityCtl = await page.evaluate(`(() => {
    const els = [...document.querySelectorAll('button, [role="button"], [role="tab"], [role="switch"], input, [contenteditable="true"], select')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.y > 300; });
    return els.map(e => ({ tag: e.tagName.toLowerCase(), role: e.getAttribute('role'), aria: e.getAttribute('aria-label'),
      text: (e.innerText || e.getAttribute('placeholder') || '').trim().slice(0, 70).replace(/\\n/g, ' | '),
      x: Math.round(e.getBoundingClientRect().x), y: Math.round(e.getBoundingClientRect().y), w: Math.round(e.getBoundingClientRect().width) }));
  })()`);
  fs.writeFileSync(`${OUT}/linear-50-activity-ctl.json`, JSON.stringify(activityCtl, null, 1));
  log(`activity ctl=${activityCtl.length}`);

  // activity filter ("Show: all/comments") toggle
  const filterBtn = page
    .locator(
      'button:has-text("All activity"), button:has-text("Comments"), [role="combobox"]:has-text("activity")',
    )
    .first();
  if (await filterBtn.count()) {
    await filterBtn.click();
    await dump('linear-51-activity-filter');
    await page.keyboard.press('Escape');
  }

  // subscribe bell in header row (next to ⋯)? dump all header-adjacent buttons again at y 55-100
  const row2 = await page.evaluate(`(() => {
    const els = [...document.querySelectorAll('button, [role="switch"], [role="button"]')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.y >= 45 && r.y < 100 && r.x > 990; });
    return els.map(e => ({ x: Math.round(e.getBoundingClientRect().x), aria: e.getAttribute('aria-label'), role: e.getAttribute('role'), text: (e.innerText||'').trim().slice(0,40) }));
  })()`);
  fs.writeFileSync(`${OUT}/linear-52-header-row2.json`, JSON.stringify(row2, null, 1));

  log('done');
} catch (e) {
  log('ERR ' + e.message.split('\n')[0]);
}
fs.writeFileSync(`${OUT}/done-a02.txt`, 'done');
process.exit(0);
