// Self-contained Orvilo audit: headless chromium → login → task APX-6 detail
// → inventory + open every picker/menu. Env: ORVILO_BASE (default :3010).
import { chromium } from 'playwright';
import fs from 'node:fs';
const OUT = '/tmp/parity-audit-2026-09-23/issue-detail';
const BASE = process.env.ORVILO_BASE || 'http://localhost:3010';
const TASK = process.env.ORVILO_TASK || 'APX-6';
const log = (m) => {
  try {
    fs.appendFileSync(`${OUT}/audit-log.txt`, `${new Date().toISOString()} ${m}\n`);
  } catch {}
};

const INV = `(() => {
  const els = [...document.querySelectorAll('a[href], button, [role="button"], [role="tab"], [role="menuitem"], [role="checkbox"], [role="switch"], [role="combobox"], input, [contenteditable="true"], [data-testid], textarea')];
  return els.filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; }).map(e => ({
    tag: e.tagName.toLowerCase(), role: e.getAttribute('role'),
    text: (e.innerText || e.value || e.getAttribute('placeholder') || '').trim().slice(0, 80).replace(/\\n/g,' | '),
    aria: e.getAttribute('aria-label'), href: e.getAttribute('href'), testid: e.getAttribute('data-testid'),
    x: Math.round(e.getBoundingClientRect().x), y: Math.round(e.getBoundingClientRect().y),
    w: Math.round(e.getBoundingClientRect().width), h: Math.round(e.getBoundingClientRect().height),
  }));
})()`;

const MENUS = `(() => {
  const roots = [...document.querySelectorAll('[role="menu"], [role="listbox"], [data-radix-popper-content-wrapper], .ant-dropdown, .ant-popover, [class*="popover" i]')].filter(e=>{const r=e.getBoundingClientRect();return r.width>10&&r.height>10;});
  return roots.map(root => {
    const rect = root.getBoundingClientRect();
    const items = [...root.querySelectorAll('[role="menuitem"],[role="option"],[role="menuitemcheckbox"],[role="menuitemradio"],[role="separator"],li,button,.ant-dropdown-menu-item,input,[class*="item" i]')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0;});
    return {x:Math.round(rect.x),y:Math.round(rect.y),w:Math.round(rect.width),h:Math.round(rect.height),items:items.slice(0,60).map(e=>({role:e.getAttribute('role')||e.tagName.toLowerCase(),text:(e.innerText||e.getAttribute('placeholder')||e.getAttribute('aria-label')||'').trim().slice(0,100).replace(/\\n/g,' | '),checked:e.getAttribute('aria-checked')??e.getAttribute('aria-selected'),disabled:e.getAttribute('aria-disabled')||(e.disabled===true?'true':undefined)}))};
  });
})()`;

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
log('H: launched, base=' + BASE);

const dump = async (tag) => {
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${OUT}/${tag}.png` });
  const d = await page.evaluate(MENUS);
  fs.writeFileSync(`${OUT}/${tag}.json`, JSON.stringify(d, null, 1));
  log(`${tag}: roots=${d.length} items=${d.reduce((a, r) => a + r.items.length, 0)}`);
};

try {
  // ---- login ----
  await page.goto(`${BASE}/signin`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(4000);
  const pre = page.getByRole('button', { name: /agree and continue/i });
  if (
    (await pre.count()) &&
    (await pre
      .first()
      .isVisible()
      .catch(() => false))
  ) {
    await pre.first().click();
    await page.waitForTimeout(1000);
  }
  const email = page
    .locator('input[type="email"], input[name="email"], input[placeholder*="email" i]')
    .first();
  if ((await email.count()) && (await email.isVisible().catch(() => false))) {
    await email.click();
    await email.fill('agent-testing@orvilo.aspectlylabs.com');
    const cb = page.locator('text=/I have read and agree/i').first();
    if (await cb.count()) {
      await cb.click().catch(() => {});
    }
    await page.waitForTimeout(500);
    await page
      .getByRole('button', { name: /^next$/i })
      .first()
      .click();
    await page.waitForTimeout(2500);
    const agree = page.getByRole('button', { name: /agree and continue/i });
    if (
      (await agree.count()) &&
      (await agree
        .first()
        .isVisible()
        .catch(() => false))
    ) {
      await agree.first().click();
      await page.waitForTimeout(3500);
    }
    const pwd = page.locator('input[type="password"]').first();
    if ((await pwd.count()) && (await pwd.isVisible().catch(() => false))) {
      await pwd.click();
      await pwd.fill('TestPassword123!');
      await page
        .getByRole('button', { name: /sign in|log in|登录|^next$/i })
        .first()
        .click();
      await page.waitForTimeout(9000);
    }
  }
  log('H: after login ' + page.url());
  await page.screenshot({ path: `${OUT}/orvilo-05-postlogin.png` });

  // ---- task detail ----
  await page.goto(`${BASE}/agent-testing/task/${TASK}`, {
    waitUntil: 'domcontentloaded',
    timeout: 90000,
  });
  await page.waitForTimeout(12000);
  fs.writeFileSync(`${OUT}/orvilo-task-url.txt`, page.url());
  await page.screenshot({ path: `${OUT}/orvilo-10-detail-top.png` });
  const inv = await page.evaluate(INV);
  fs.writeFileSync(`${OUT}/orvilo-10-inventory.json`, JSON.stringify(inv, null, 1));
  const mainText = await page.evaluate(() =>
    (document.querySelector('main') || document.body).innerText.slice(0, 10000),
  );
  fs.writeFileSync(`${OUT}/orvilo-10-maintext.txt`, mainText);
  log(`H: detail inv=${inv.length} url=${page.url()}`);

  // scroll to bottom for activity
  await page.evaluate(() => {
    const cands = [...document.querySelectorAll('div, main, section')].filter(
      (e) => e.scrollHeight > e.clientHeight + 200 && e.clientHeight > 200,
    );
    const best = cands.sort((a, b) => b.scrollHeight - a.scrollHeight)[0];
    if (best) best.scrollTop = best.scrollHeight;
  });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/orvilo-11-detail-bottom.png` });
  await page.evaluate(() => {
    const cands = [...document.querySelectorAll('div, main, section')].filter(
      (e) => e.scrollHeight > e.clientHeight + 200 && e.clientHeight > 200,
    );
    const best = cands.sort((a, b) => b.scrollHeight - a.scrollHeight)[0];
    if (best) best.scrollTop = 0;
  });
  await page.waitForTimeout(800);
} catch (e) {
  log('H ERR ' + e.message.split('\n')[0]);
}
fs.writeFileSync(`${OUT}/done-14.txt`, 'done');
process.exit(0);
