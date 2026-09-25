// Stage D: hover ⋯menu submenus on Linear — Copy, Mark as, Remove, Create related, Team, Due date.
import { chromium } from 'playwright';
import fs from 'node:fs';
const OUT = '/tmp/parity-audit-2026-09-23/issue-detail';
const log = (m) => fs.appendFileSync(`${OUT}/audit-log.txt`, `${new Date().toISOString()} ${m}\n`);
const browser = await chromium.connectOverCDP('http://localhost:9222', { timeout: 120000 });
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
await page.setViewportSize({ width: 1440, height: 900 });
log('D: tab');
const DUMP = `(() => {
  const roots = [...document.querySelectorAll('[role="menu"], [role="listbox"], [data-radix-popper-content-wrapper]')].filter(e=>{const r=e.getBoundingClientRect();return r.width>10&&r.height>10;});
  return roots.map(root => {
    const items = [...root.querySelectorAll('[role="menuitem"],[role="option"],[role="menuitemcheckbox"],[role="menuitemradio"],[role="separator"],button,li')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0;});
    return items.map(e=>' '.repeat(0)+'['+(e.getAttribute('role')||e.tagName)+'] '+(e.innerText||'').trim().replace(/\\n/g,' | ').slice(0,100));
  });
})()`;
try {
  await page.goto(
    'https://linear.app/bdiverifier/issue/ORV-115/slimming-15-remove-orphan-achaos-subsystem-and-chaos-fixtures',
    { waitUntil: 'domcontentloaded', timeout: 45000 },
  );
  await page.waitForTimeout(8000);
  const moreBtn = page.locator('button[aria-label="Issue options"]').first();
  await moreBtn.click();
  await page.waitForTimeout(1000);
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
    const item = page
      .locator(`[role="option"]:has-text("${name}"), [role="menuitem"]:has-text("${name}")`)
      .first();
    if (await item.count()) {
      await item.hover();
      await page.waitForTimeout(900);
      const dump = await page.evaluate(DUMP);
      fs.writeFileSync(
        `${OUT}/linear-submenu-${name.replace(/\s/g, '').toLowerCase()}.json`,
        JSON.stringify(dump, null, 1),
      );
      await page.screenshot({
        path: `${OUT}/linear-submenu-${name.replace(/\s/g, '').toLowerCase()}.png`,
      });
      log(`D: submenu ${name} roots=${dump.length}`);
    } else {
      log(`D: no item ${name}`);
    }
  }
  await page.keyboard.press('Escape');
} catch (e) {
  log('D ERR ' + e.message);
}
fs.writeFileSync(`${OUT}/done-09.txt`, 'done');
process.exit(0);
