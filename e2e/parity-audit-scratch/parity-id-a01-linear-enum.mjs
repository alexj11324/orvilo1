// Linear issue-detail FULL enumeration: every interactive control + all menus.
// Reuses the ONE existing Linear tab (or creates one). Read-only: opens menus,
// dumps items, Escapes. Never submits.
import { chromium } from 'playwright';
import fs from 'node:fs';

const OUT =
  '/Users/devin/repos/wt-parity-issue-detail/.agents/runtime-acceptance/parity-2026-09-23/issue-detail';
const URL =
  'https://linear.app/bdiverifier/issue/ORV-115/slimming-15-remove-orphan-achaos-subsystem-and-chaos-fixtures';
const log = (m) => {
  console.log(m);
  try {
    fs.appendFileSync(`${OUT}/audit-log.txt`, `${new Date().toISOString()} ${m}\n`);
  } catch {}
};

const browser = await chromium.connectOverCDP('http://localhost:9222', { timeout: 120000 });
const ctx = browser.contexts()[0];
let page = ctx.pages().find((p) => p.url().includes('linear.app'));
if (!page) page = await ctx.newPage();
await page.setViewportSize({ width: 1440, height: 900 });

// ---------- helpers ----------
const CONTROL_DUMP = `(() => {
  const seen = new Set();
  const els = [...document.querySelectorAll('button, [role="button"], a[href], [role="link"], [role="tab"], [role="checkbox"], [role="switch"], input, [contenteditable="true"], select, [aria-haspopup]')];
  const out = [];
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
      expanded: e.getAttribute('aria-expanded'),
      text: (e.innerText || e.getAttribute('placeholder') || '').trim().slice(0, 80).replace(/\\n/g, ' | '),
      href: e.getAttribute('href')?.slice(0, 110),
      title: e.getAttribute('title') || e.closest('[title]')?.getAttribute('title'),
      x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
      ce: e.getAttribute('contenteditable'),
      svg: svg ? (svg.getAttribute('class') || svg.outerHTML.slice(0, 140)) : undefined,
    });
  }
  return out.sort((a, b) => a.y - b.y || a.x - b.x);
})()`;

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
  log('nav -> ' + URL);
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(9000);
  log('at ' + page.url());
  await page.screenshot({ path: `${OUT}/linear-00-full.png` });

  // Full control inventory (top of document)
  const inv = await page.evaluate(CONTROL_DUMP);
  fs.writeFileSync(`${OUT}/linear-01-controls.json`, JSON.stringify(inv, null, 1));
  log(`controls=${inv.length}`);

  // ---- Header region controls ----
  // breadcrumb segments + copy-id chip + bell + more
  await dump('linear-02-top');

  // 1) breadcrumb: project/team crumb (first link in main)
  // 2) "ORV-115 ▾" chip — click opens copy menu?
  await clickAndDump(
    'linear-10-idchip',
    page.locator('main button:has-text("ORV-115"), [role="button"]:has-text("ORV-115")'),
  );
  // 3) bell / subscribe
  await clickAndDump(
    'linear-11-bell',
    page.locator(
      'button[aria-label*="ubscri"], button[aria-label*="notification" i], button[aria-label*="Bell" i]',
    ),
  );
  // 4) more (⋯)
  await clickAndDump(
    'linear-12-more',
    page.locator('button[aria-label="Issue options"], button[aria-label*="options" i]').last(),
  );

  // ---- Right rail property buttons ----
  await clickAndDump('linear-20-status', page.locator('button:has-text("Done")').last());
  await clickAndDump(
    'linear-21-priority',
    page.locator('button:has-text("High"), button:has-text("Priority")').last(),
  );
  await clickAndDump(
    'linear-22-assignee',
    page.locator('button:has-text("Assign"), button:has-text("Unassigned")').last(),
  );
  await clickAndDump(
    'linear-23-estimate',
    page.locator('button:has-text("Estimate"), button:has-text("Set estimate")').last(),
  );
  await clickAndDump(
    'linear-24-labels',
    page
      .locator(
        'button[aria-label="Add labels"], button:has-text("Add label"), button:has-text("Labels")',
      )
      .last(),
  );
  await clickAndDump(
    'linear-25-project',
    page
      .locator('button:has-text("Add to project"), [aria-label*="project" i][role="button"]')
      .last(),
  );
  await clickAndDump(
    'linear-26-cycle',
    page.locator('button:has-text("Add to cycle"), button:has-text("Cycle")').last(),
  );
  await clickAndDump(
    'linear-27-duedate',
    page
      .locator(
        'button:has-text("Due date"), button:has-text("Set due date"), button:has-text("No due date")',
      )
      .last(),
  );
  await clickAndDump(
    'linear-28-milestone',
    page.locator('button:has-text("Milestone"), button:has-text("Add milestone")').last(),
  );
  await clickAndDump(
    'linear-29-subscriber',
    page.locator('button[aria-label*="subscriber" i], button[aria-label*="Subscribe" i]').last(),
  );

  log('done menus');
} catch (e) {
  log('ERR ' + e.message.split('\n')[0]);
}
fs.writeFileSync(`${OUT}/done-a01.txt`, 'done');
process.exit(0);
