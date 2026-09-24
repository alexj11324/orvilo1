// Orvilo control audit: identify header icons + open each picker/menu on APX-6.
import { chromium } from 'playwright';
import fs from 'node:fs';
import { orviloLogin } from './parity-login.mjs';
const OUT = '/tmp/parity-audit-2026-09-23/issue-detail';
const BASE = process.env.ORVILO_BASE || 'http://localhost:3010';
const log = (m) => {
  try {
    fs.appendFileSync(`${OUT}/audit-log.txt`, `${new Date().toISOString()} ${m}\n`);
  } catch {}
};

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

const MENUS = `(() => {
  const roots = [...document.querySelectorAll('[role="menu"], [role="listbox"], .ant-dropdown, .ant-popover:not(.ant-popover-hidden), .ant-select-dropdown')].filter(e=>{const r=e.getBoundingClientRect();return r.width>10&&r.height>10;});
  return roots.map(root => {
    const items = [...root.querySelectorAll('[role="menuitem"],[role="option"],[role="separator"],li,button,.ant-dropdown-menu-item,input,[class*="item" i]')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0;});
    return {x:Math.round(root.getBoundingClientRect().x),y:Math.round(root.getBoundingClientRect().y),w:Math.round(root.getBoundingClientRect().width),items:items.slice(0,60).map(e=>({role:e.getAttribute('role')||e.tagName.toLowerCase(),text:(e.innerText||e.getAttribute('placeholder')||e.getAttribute('aria-label')||'').trim().slice(0,110).replace(/\\n/g,' | ')}))};
  });
})()`;

const dump = async (tag) => {
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/${tag}.png` });
  const d = await page.evaluate(MENUS);
  fs.writeFileSync(`${OUT}/${tag}.json`, JSON.stringify(d, null, 1));
  log(`${tag}: roots=${d.length} items=${d.reduce((a, r) => a + r.items.length, 0)}`);
};

try {
  const ok = await orviloLogin(page, BASE, (m) => log('C ' + m));
  log('C: login ok=' + ok);

  await page.goto(`${BASE}/agent-testing/task/APX-6`, {
    waitUntil: 'domcontentloaded',
    timeout: 90000,
  });
  await page.waitForTimeout(11000);
  log('C: at ' + page.url());

  // 1) dump every header-region control's html to identify icons
  const hdr = await page.evaluate(`(() => {
    const els = [...document.querySelectorAll('button, [role="button"], a')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&r.y<70&&r.x>240;});
    return els.map(e=>({x:Math.round(e.getBoundingClientRect().x),y:Math.round(e.getBoundingClientRect().y),w:Math.round(e.getBoundingClientRect().width),aria:e.getAttribute('aria-label'),text:(e.innerText||'').trim().slice(0,40),html:e.outerHTML.slice(0,400)}));
  })()`);
  fs.writeFileSync(`${OUT}/orvilo-12-header-buttons.json`, JSON.stringify(hdr, null, 1));
  log('C: header buttons ' + hdr.length);

  // 2) rail action buttons (x>1300,y<100)
  const rail = await page.evaluate(`(() => {
    const els = [...document.querySelectorAll('button, [role="button"]')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.x>1300&&r.y<100;});
    return els.map(e=>({x:Math.round(e.getBoundingClientRect().x),y:Math.round(e.getBoundingClientRect().y),aria:e.getAttribute('aria-label'),html:e.outerHTML.slice(0,300)}));
  })()`);
  fs.writeFileSync(`${OUT}/orvilo-13-rail-buttons.json`, JSON.stringify(rail, null, 1));

  // 3) status picker
  await page.locator('text=Pending review').first().click();
  await dump('orvilo-20-status-picker');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  // 4) priority
  await page.locator('text=High').first().click();
  await dump('orvilo-21-priority-picker');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  // 5) assignee (first "Agent Testing User" row in rail)
  await page.locator('[role="button"]:has-text("Agent Testing User")').first().click();
  await dump('orvilo-22-assignee-picker');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  // 6) labels row
  await page.locator('[role="button"]:has-text("Labels")').first().click();
  await dump('orvilo-23-label-picker');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  // 7) milestone
  await page.locator('[role="button"]:has-text("APX M2")').first().click();
  await dump('orvilo-24-milestone-picker');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  // 8) more menu — rightmost header button
  await page.evaluate(`(() => {
    const btns=[...document.querySelectorAll('button')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.y<70&&r.x>1380;});
    if (btns.length) btns[btns.length-1].click();
  })()`);
  await dump('orvilo-25-more-menu');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  // 9) ID chip click (does it copy?)
  const chip = page.locator('text=APX-6').first();
  if (await chip.count()) {
    await chip.click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT}/orvilo-26-idchip-click.png` });
  }
  // 10) comment hover
  const cmt = page.locator('text=Blocking on the approval card').first();
  if (await cmt.count()) {
    await cmt.scrollIntoViewIfNeeded().catch(() => {});
    await cmt.hover();
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${OUT}/orvilo-27-comment-hover.png` });
    const hinv = await page.evaluate(`(() => {
      const els=[...document.querySelectorAll('button,[role="button"],[role="menuitem"]')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&r.y>500;});
      return els.map(e=>({aria:e.getAttribute('aria-label'),text:(e.innerText||'').trim().slice(0,40),x:Math.round(e.getBoundingClientRect().x),y:Math.round(e.getBoundingClientRect().y)}));
    })()`);
    fs.writeFileSync(`${OUT}/orvilo-27-comment-hover.json`, JSON.stringify(hinv, null, 1));
  }
  log('C: done');
} catch (e) {
  log('C ERR ' + e.message.split('\n')[0]);
}
fs.writeFileSync(`${OUT}/done-16.txt`, 'done');
process.exit(0);
