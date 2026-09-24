// Final probes: Orvilo status menu + comment ⋯ + rail section labels +
// Linear header action alignment (are star/⋯ right-docked or inline?).
import { chromium } from 'playwright';
import fs from 'node:fs';

const OUT =
  '/Users/devin/repos/wt-parity-issue-detail/.agents/runtime-acceptance/parity-2026-09-23/issue-detail';
const LURL =
  'https://linear.app/bdiverifier/issue/ORV-115/slimming-15-remove-orphan-achaos-subsystem-and-chaos-fixtures';
const OURL = 'http://localhost:3010/agent-testing/task/PMI-1/urgent-review-release-evidence';
const log = (m) => {
  console.log(m);
  try {
    fs.appendFileSync(`${OUT}/audit-log.txt`, `a06 ${new Date().toISOString()} ${m}\n`);
  } catch {}
};

const browser = await chromium.connectOverCDP('http://localhost:9222', { timeout: 120000 });
const ctx = browser.contexts()[0];
let lp = ctx.pages().find((p) => p.url().includes('linear.app'));
if (!lp) lp = await ctx.newPage();
let op = ctx.pages().find((p) => p.url().includes('localhost:3010'));
if (!op) op = ctx.pages().find((p) => p.url() === 'about:blank') || (await ctx.newPage());
for (const p of [lp, op]) await p.setViewportSize({ width: 1440, height: 900 });

const MENU_DUMP = `(() => {
  const roots = [...document.querySelectorAll('[role="menu"], [role="listbox"], [role="dialog"], .ant-dropdown, .ant-popover:not(.ant-popover-hidden), .ant-select-dropdown, [data-radix-popper-content-wrapper], [class*="popover" i]')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 10 && r.height > 10; });
  return roots.map(root => {
    const rect = root.getBoundingClientRect();
    const items = [...root.querySelectorAll('[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], [role="option"], [role="separator"], input, [class*="header" i], li, button, a[href], .ant-dropdown-menu-item, [class*="navitem" i], [data-assignee-index]')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
    return { role: root.getAttribute('role'), x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height),
      items: items.slice(0, 80).map(e => ({ role: e.getAttribute('role'), tag: e.tagName.toLowerCase(),
        text: (e.innerText || e.getAttribute('placeholder') || e.getAttribute('aria-label') || '').trim().slice(0, 120).replace(/\\n/g, ' | ') })) };
  });
})()`;

const dump = async (page, tag) => {
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/${tag}.png` });
  const d = await page.evaluate(MENU_DUMP);
  fs.writeFileSync(`${OUT}/${tag}.json`, JSON.stringify(d, null, 1));
  log(`${tag}: roots=${d.length} items=${d.reduce((a, r) => a + r.items.length, 0)}`);
};

try {
  // ===== ORVILO =====
  await op.goto(OURL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await op.waitForTimeout(9000);
  log('orvilo at ' + op.url());

  // Rail section headers + full rail text
  const railText = await op.evaluate(`(() => {
    const els = [...document.querySelectorAll('span, div')].filter(e => e.childElementCount === 0 && e.getBoundingClientRect().x > 1040 && e.getBoundingClientRect().width > 0);
    return els.map(e => ({ y: Math.round(e.getBoundingClientRect().y), x: Math.round(e.getBoundingClientRect().x), text: e.innerText.trim().slice(0, 60) })).filter(e => e.text);
  })()`);
  fs.writeFileSync(`${OUT}/orvilo-60-rail-text.json`, JSON.stringify(railText, null, 1));
  log('rail text rows=' + railText.length);

  // status menu — click the Backlog row at x=1070,y=173
  await op.mouse.click(1150, 188);
  await dump(op, 'orvilo-61-status');
  await op.keyboard.press('Escape');
  await op.waitForTimeout(400);

  // comment card ⋯ menu — hover a comment first
  const cmtCard = op.locator('[class*="commentCard"]').first();
  if (await cmtCard.count()) {
    await cmtCard.scrollIntoViewIfNeeded().catch(() => {});
    await cmtCard.hover();
    await op.waitForTimeout(600);
    const moreBtn = op
      .locator('[class*="commentActions"] button, [class*="commentCard"] button')
      .first();
    if (await moreBtn.count()) {
      await moreBtn.click();
      await dump(op, 'orvilo-62-comment-menu');
      await op.keyboard.press('Escape');
    }
  } else {
    log('no comment card on PMI-1');
    // try clicking any comment actions button in the activity list
    const actBtn = op.locator('button:has(svg.lucide-ellipsis)').last();
    if (await actBtn.count()) {
      await actBtn.click();
      await dump(op, 'orvilo-62-comment-menu');
      await op.keyboard.press('Escape');
    }
  }

  // subtasks section structure
  const subtasks = await op.evaluate(`(() => {
    const els = [...document.querySelectorAll('*')].filter(e => e.childElementCount === 0 && /subtask|sub-issue|add/i.test(e.innerText||''));
    return els.slice(0, 20).map(e => ({ tag: e.tagName.toLowerCase(), text: e.innerText.trim().slice(0, 60), x: Math.round(e.getBoundingClientRect().x), y: Math.round(e.getBoundingClientRect().y) }));
  })()`);
  fs.writeFileSync(`${OUT}/orvilo-63-subtasks.json`, JSON.stringify(subtasks, null, 1));

  // ===== LINEAR: header right-dock check =====
  await lp.goto(LURL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await lp.waitForTimeout(8000);
  const lhead = await lp.evaluate(`(() => {
    const star = document.querySelector('button[aria-label="Add to favorites"], button[role="switch"]');
    const more = document.querySelector('button[aria-label="Issue options"]');
    const crumb = [...document.querySelectorAll('a')].find(e => (e.innerText||'').includes('ORV-115'));
    const parent = star?.parentElement;
    // walk up to the header container and measure
    let hdr = star; for (let i=0;i<8 && hdr;i++) hdr = hdr.parentElement;
    const hr = hdr?.getBoundingClientRect();
    return {
      starX: Math.round(star?.getBoundingClientRect().x ?? -1),
      moreX: Math.round(more?.getBoundingClientRect().x ?? -1),
      crumbRight: Math.round((crumb?.getBoundingClientRect().right ?? -1)),
      headerW: Math.round(hr?.width ?? -1),
      headerX: Math.round(hr?.x ?? -1),
      viewportW: innerWidth,
    };
  })()`);
  fs.writeFileSync(`${OUT}/linear-80-header-align.json`, JSON.stringify(lhead, null, 1));
  log('linear header ' + JSON.stringify(lhead));

  // Linear: rail section header texts
  const lrail = await lp.evaluate(`(() => {
    const els = [...document.querySelectorAll('span, div, h2, h3')].filter(e => e.childElementCount === 0 && e.getBoundingClientRect().x > 990 && e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().width < 400);
    return els.map(e => ({ y: Math.round(e.getBoundingClientRect().y), x: Math.round(e.getBoundingClientRect().x), tag: e.tagName.toLowerCase(), text: e.innerText.trim().slice(0, 60) })).filter(e => e.text);
  })()`);
  fs.writeFileSync(`${OUT}/linear-81-rail-text.json`, JSON.stringify(lrail, null, 1));
  log('linear rail text rows=' + lrail.length);

  // Linear: sub-issues section — heading + add button placement
  const lsub = await lp.evaluate(`(() => {
    const els = [...document.querySelectorAll('*')].filter(e => e.childElementCount === 0 && /sub-iss|subiss|Add sub/i.test(e.innerText||''));
    return els.slice(0, 20).map(e => ({ tag: e.tagName.toLowerCase(), text: e.innerText.trim().slice(0, 70), x: Math.round(e.getBoundingClientRect().x), y: Math.round(e.getBoundingClientRect().y), closest: e.closest('button,a,[role="button"]')?.getAttribute('aria-label') }));
  })()`);
  fs.writeFileSync(`${OUT}/linear-82-subissues.json`, JSON.stringify(lsub, null, 1));
  log('linear subissues=' + JSON.stringify(lsub).slice(0, 300));

  log('done');
} catch (e) {
  log('ERR ' + e.message.split('\n')[0]);
}
fs.writeFileSync(`${OUT}/done-a06.txt`, 'done');
process.exit(0);
