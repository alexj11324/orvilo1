// Linear probe #3: open ⋯ submenus (Copy, Create related, Mark as, Due date,
// Team, Convert to, Remind me), then hover a comment to reveal its controls.
import { chromium } from 'playwright';
import fs from 'node:fs';

const OUT =
  '/Users/devin/repos/wt-parity-issue-detail/.agents/runtime-acceptance/parity-2026-09-23/issue-detail';
const URL =
  'https://linear.app/bdiverifier/issue/ORV-115/slimming-15-remove-orphan-achaos-subsystem-and-chaos-fixtures';
const log = (m) => {
  console.log(m);
  try {
    fs.appendFileSync(`${OUT}/audit-log.txt`, `a05 ${new Date().toISOString()} ${m}\n`);
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
    return { role: root.getAttribute('role'), x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height),
      items: items.slice(0, 80).map(e => ({ role: e.getAttribute('role'), tag: e.tagName.toLowerCase(),
        text: (e.innerText || e.getAttribute('placeholder') || e.getAttribute('aria-label') || '').trim().slice(0, 120).replace(/\\n/g, ' | '),
        checked: e.getAttribute('aria-checked') ?? e.getAttribute('aria-selected'),
        kbd: e.querySelector('kbd, [class*="shortcut" i]')?.innerText?.trim()?.slice(0, 30) })) };
  });
})()`;

const dump = async (tag) => {
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/${tag}.png` });
  const d = await page.evaluate(MENU_DUMP);
  fs.writeFileSync(`${OUT}/${tag}.json`, JSON.stringify(d, null, 1));
  log(`${tag}: roots=${d.length} items=${d.reduce((a, r) => a + r.items.length, 0)}`);
};

try {
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(9000);
  log('at ' + page.url());

  const moreBtn = page.locator('button[aria-label="Issue options"]').first();
  const openMore = async () => {
    await moreBtn.click();
    await page.waitForTimeout(700);
  };

  // Open ⋯ then hover each submenu item and dump
  for (const [tag, label] of [
    ['linear-60-sub-copy', 'Copy'],
    ['linear-61-sub-related', 'Create related'],
    ['linear-62-sub-markas', 'Mark as'],
    ['linear-63-sub-duedate', 'Due date'],
    ['linear-64-sub-team', 'Team'],
    ['linear-65-sub-convert', 'Convert to'],
    ['linear-66-sub-remind', 'Remind me'],
  ]) {
    await openMore();
    const item = page
      .locator(`[role="option"]:has-text("${label}"), [role="menuitem"]:has-text("${label}")`)
      .first();
    if (await item.count()) {
      await item.hover();
      await dump(tag);
    } else log(`${tag}: item '${label}' not found`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  }

  // Comment hover → reveal Add reaction / Comment options
  await page.evaluate(() => {
    const cands = [...document.querySelectorAll('div, main')].filter(
      (e) => e.scrollHeight > e.clientHeight + 200 && e.clientHeight > 300,
    );
    const best = cands.sort((a, b) => b.scrollHeight - a.scrollHeight)[0];
    if (best) best.scrollTop = best.scrollHeight - 900;
  });
  await page.waitForTimeout(1200);
  // hover near a comment author name "Alex Jiang"
  const cmt = page.locator('a:has-text("Alex Jiang")').last();
  if (await cmt.count()) {
    await cmt.hover();
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/linear-70-comment-hover.png` });
    const revealed = await page.evaluate(`(() => {
      const els = [...document.querySelectorAll('button,[role="button"],[role="menuitem"]')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.y > 200 && r.y < 900; });
      return els.map(e => ({ aria: e.getAttribute('aria-label'), text: (e.innerText||'').trim().slice(0,50), x: Math.round(e.getBoundingClientRect().x), y: Math.round(e.getBoundingClientRect().y) }));
    })()`);
    fs.writeFileSync(`${OUT}/linear-70-comment-hover.json`, JSON.stringify(revealed, null, 1));
    log('comment hover controls=' + revealed.length);
  }

  // Composer anatomy — the main comment box at bottom
  await page.evaluate(() => {
    const cands = [...document.querySelectorAll('div, main')].filter(
      (e) => e.scrollHeight > e.clientHeight + 200 && e.clientHeight > 300,
    );
    const best = cands.sort((a, b) => b.scrollHeight - a.scrollHeight)[0];
    if (best) best.scrollTop = best.scrollHeight;
  });
  await page.waitForTimeout(1200);
  const composer = await page.evaluate(`(() => {
    const ce = [...document.querySelectorAll('[contenteditable="true"]')].filter(e => e.getBoundingClientRect().width > 0);
    return ce.map(e => { const r = e.getBoundingClientRect();
      const box = e.closest('div');
      const btns = box ? [...box.parentElement.querySelectorAll('button')].map(b => ({ aria: b.getAttribute('aria-label'), x: Math.round(b.getBoundingClientRect().x) })) : [];
      return { y: Math.round(r.y), w: Math.round(r.width), ph: e.getAttribute('aria-label') || e.getAttribute('placeholder'), btns }; });
  })()`);
  fs.writeFileSync(`${OUT}/linear-71-composer.json`, JSON.stringify(composer, null, 1));
  log('composer=' + JSON.stringify(composer));

  // Activity heading row — "Activity" label + filter + subscribe area, at bottom of scroll
  const actHeader = await page.evaluate(`(() => {
    const els = [...document.querySelectorAll('*')].filter(e => e.childElementCount === 0 && /^(Activity|Comments|Unsubscribe|Subscribe)$/.test((e.innerText||'').trim()));
    return els.map(e => ({ tag: e.tagName.toLowerCase(), text: e.innerText.trim(), x: Math.round(e.getBoundingClientRect().x), y: Math.round(e.getBoundingClientRect().y), role: e.getAttribute('role'), closest: e.closest('button,[role="button"],a')?.getAttribute('aria-label') }));
  })()`);
  fs.writeFileSync(`${OUT}/linear-72-activity-header.json`, JSON.stringify(actHeader, null, 1));
  log('actHeader=' + JSON.stringify(actHeader).slice(0, 400));

  log('done');
} catch (e) {
  log('ERR ' + e.message.split('\n')[0]);
}
fs.writeFileSync(`${OUT}/done-a05.txt`, 'done');
process.exit(0);
