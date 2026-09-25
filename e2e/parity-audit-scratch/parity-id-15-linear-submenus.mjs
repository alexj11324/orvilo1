// Stage D-retry: Linear ⋯menu submenus via direct ws + retries.
import { chromium } from 'playwright';
import fs from 'node:fs';
const OUT = '/tmp/parity-audit-2026-09-23/issue-detail';
const log = (m) => {
  try {
    fs.appendFileSync(`${OUT}/audit-log.txt`, `${new Date().toISOString()} ${m}\n`);
  } catch {}
};
const WS = 'ws://127.0.0.1:9222/devtools/browser/ecf8ca89-0876-46fe-b320-d58cc7c48364';

let browser;
for (let i = 0; i < 12; i++) {
  try {
    browser = await chromium.connectOverCDP(WS, { timeout: 60000 });
    break;
  } catch (e) {
    log(`D2: connect ${i} fail`);
    await new Promise((r) => setTimeout(r, 20000));
  }
}
if (!browser) {
  fs.writeFileSync(`${OUT}/done-15.txt`, 'no-cdp');
  process.exit(1);
}
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
await page.setViewportSize({ width: 1440, height: 900 });
log('D2: tab');
const DUMP = `(() => {
  const roots = [...document.querySelectorAll('[role="menu"], [role="listbox"], [data-radix-popper-content-wrapper]')].filter(e=>{const r=e.getBoundingClientRect();return r.width>10&&r.height>10;});
  return roots.map(root => {
    const items = [...root.querySelectorAll('[role="menuitem"],[role="option"],[role="menuitemcheckbox"],[role="menuitemradio"],[role="separator"],button,li,input')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0;});
    return {rect:[Math.round(root.getBoundingClientRect().x),Math.round(root.getBoundingClientRect().y)], items: items.map(e=>'['+(e.getAttribute('role')||e.tagName)+'] '+(e.innerText||e.getAttribute('placeholder')||'').trim().replace(/\\n/g,' | ').slice(0,100))};
  });
})()`;
try {
  await page.goto(
    'https://linear.app/bdiverifier/issue/ORV-115/slimming-15-remove-orphan-achaos-subsystem-and-chaos-fixtures',
    { waitUntil: 'domcontentloaded', timeout: 90000 },
  );
  await page.waitForTimeout(10000);
  const moreBtn = page.locator('button[aria-label="Issue options"]').first();
  await moreBtn.waitFor({ state: 'visible', timeout: 30000 });
  await moreBtn.click();
  await page.waitForTimeout(1200);
  for (const name of [
    'Copy',
    'Mark as',
    'Remove',
    'Create related',
    'Team',
    'Due date',
    'Remind me',
    'Convert to',
  ]) {
    const item = page.locator(`[role="option"]:text-is("${name}")`).first();
    if (await item.count()) {
      await item.hover();
      await page.waitForTimeout(1100);
      const dump = await page.evaluate(DUMP);
      fs.writeFileSync(
        `${OUT}/linear-submenu-${name.replace(/\s/g, '').toLowerCase()}.json`,
        JSON.stringify(dump, null, 1),
      );
      await page.screenshot({
        path: `${OUT}/linear-submenu-${name.replace(/\s/g, '').toLowerCase()}.png`,
      });
      log(`D2: submenu ${name} roots=${dump.length}`);
    } else {
      log(`D2: no item "${name}"`);
    }
  }
  await page.keyboard.press('Escape');
  // comment hover actions: hover the comment card, then screenshot + inventory
  const commentCard = page.locator('text=via MCP').first();
  if (await commentCard.count()) {
    await commentCard.hover();
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/linear-26-comment-hover.png` });
    const inv = await page.evaluate(`(() => {
      const els=[...document.querySelectorAll('button,[role="button"]')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&r.y>200&&r.y<760;});
      return els.map(e=>({aria:e.getAttribute('aria-label'),text:(e.innerText||'').trim().slice(0,50),x:Math.round(e.getBoundingClientRect().x),y:Math.round(e.getBoundingClientRect().y)}));
    })()`);
    fs.writeFileSync(`${OUT}/linear-26-comment-hover.json`, JSON.stringify(inv, null, 1));
    log('D2: comment hover captured');
  }
} catch (e) {
  log('D2 ERR ' + e.message.split('\n')[0]);
}
fs.writeFileSync(`${OUT}/done-15.txt`, 'done');
process.exit(0);
