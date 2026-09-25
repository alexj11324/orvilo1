// Orvilo probe #2: open each property picker by row text; dump page structure text.
import { chromium } from 'playwright';
import fs from 'node:fs';

const OUT =
  '/Users/devin/repos/wt-parity-issue-detail/.agents/runtime-acceptance/parity-2026-09-23/issue-detail';
const URL = 'http://localhost:3010/agent-testing/task/PMI-1/urgent-review-release-evidence';
const log = (m) => {
  console.log(m);
  try {
    fs.appendFileSync(`${OUT}/audit-log.txt`, `a04 ${new Date().toISOString()} ${m}\n`);
  } catch {}
};

const browser = await chromium.connectOverCDP('http://localhost:9222', { timeout: 120000 });
const ctx = browser.contexts()[0];
let page = ctx.pages().find((p) => p.url().includes('localhost:3010'));
if (!page) page = await ctx.newPage();
await page.setViewportSize({ width: 1440, height: 900 });

const MENU_DUMP = `(() => {
  const roots = [...document.querySelectorAll('[role="menu"], [role="listbox"], [role="dialog"], .ant-dropdown, .ant-popover:not(.ant-popover-hidden), .ant-select-dropdown, [data-radix-popper-content-wrapper], [class*="popover" i]')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 10 && r.height > 10; });
  return roots.map(root => {
    const rect = root.getBoundingClientRect();
    const items = [...root.querySelectorAll('[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], [role="option"], [role="separator"], input, [class*="header" i], li, button, a[href], .ant-dropdown-menu-item')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
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

try {
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(9000);
  log('at ' + page.url());

  // Page text skeleton — the main column, line by line
  const skeleton = await page.evaluate(`(() => {
    const main = document.querySelector('main') || document.body;
    const lines = [];
    const walk = (el, depth) => {
      if (depth > 14 || lines.length > 400) return;
      const r = el.getBoundingClientRect?.();
      if (!r || r.width < 2 || r.height < 2) return;
      const own = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join(' ').trim();
      const tag = el.tagName?.toLowerCase();
      const role = el.getAttribute?.('role');
      if (own || ['button','a','input','textarea','select','h1','h2','h3'].includes(tag) || role === 'button') {
        lines.push({ d: depth, tag, role, x: Math.round(r.x), y: Math.round(r.y), text: (own || el.getAttribute('placeholder') || el.getAttribute('aria-label') || (el.value||'') || '').slice(0, 90) });
      }
      for (const c of el.children) walk(c, depth + 1);
    };
    walk(main, 0);
    return lines;
  })()`);
  fs.writeFileSync(`${OUT}/orvilo-02-skeleton.json`, JSON.stringify(skeleton, null, 1));
  log('skeleton lines=' + skeleton.length);

  // Open each rail picker by visible text
  for (const [tag, txt] of [
    ['orvilo-41-status', 'Backlog'],
    ['orvilo-42-priority', 'Urgent'],
    ['orvilo-43-assignee', 'Agent Testing User'],
    ['orvilo-44-labels', 'Labels'],
    ['orvilo-45-schedule', 'Set schedule'],
  ]) {
    const loc = page.locator(`[role="button"]:has-text("${txt}"), div:has-text("${txt}")`).last();
    try {
      // pick the rail one (x>1000)
      const els = await page.evaluate(
        `[...document.querySelectorAll('div,button')].filter(e=>{const r=e.getBoundingClientRect();return r.x>1000&&r.y>100&&r.y<600&&r.width>100&&r.width<400&&(e.innerText||'').trim().startsWith(${JSON.stringify(txt)})}).map(e=>({x:Math.round(e.getBoundingClientRect().x),y:Math.round(e.getBoundingClientRect().y)}))`,
      );
      log(`${tag} candidates=${JSON.stringify(els)}`);
      if (els.length) {
        await page.mouse.click(els[0].x + 60, els[0].y + 15);
        await dump(tag);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(400);
      }
    } catch (e) {
      log(`${tag} err ${e.message.split('\n')[0]}`);
    }
  }

  // sub-issues add + run-all buttons (y≈358 x≈978/1006)
  // comment composer at bottom — find it and dump its buttons
  const composer = await page.evaluate(`(() => {
    const el = [...document.querySelectorAll('[contenteditable="true"], textarea')].find(e => e.getBoundingClientRect().y > 400);
    if (!el) return null;
    const card = el.closest('div[class]');
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), ph: el.getAttribute('placeholder') || el.getAttribute('data-placeholder') };
  })()`);
  log('composer=' + JSON.stringify(composer));

  log('done');
} catch (e) {
  log('ERR ' + e.message.split('\n')[0]);
}
fs.writeFileSync(`${OUT}/done-a04.txt`, 'done');
process.exit(0);
