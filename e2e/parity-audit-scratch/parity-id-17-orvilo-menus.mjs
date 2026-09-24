// Orvilo pass 2: generic overlay capture for assignee/labels/more-menu/etc.
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

// Any visible overlay-ish element: menu/listbox/tooltip/dialog/popover/dropdown OR fixed/absolute high-z box.
const OVERLAYS = `(() => {
  const seen = new Set();
  const sels = '[role="menu"],[role="listbox"],[role="dialog"],[role="tooltip"],[data-radix-popper-content-wrapper],[class*="popover" i],[class*="dropdown" i],[class*="overlay" i],[class*="menu" i]';
  const cands = [...document.querySelectorAll(sels)];
  const out = [];
  for (const el of cands) {
    const r = el.getBoundingClientRect();
    if (r.width < 20 || r.height < 10) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue;
    if (seen.has(el)) continue; seen.add(el);
    const items = [...el.querySelectorAll('[role="menuitem"],[role="option"],[role="menuitemcheckbox"],[role="menuitemradio"],[role="separator"],li,button,input,[class*="item" i],[class*="option" i]')]
      .filter(e => { const rr = e.getBoundingClientRect(); return rr.width > 0 && rr.height > 0; })
      .map(e => '[' + (e.getAttribute('role') || e.tagName.toLowerCase()) + '] ' + (e.innerText || e.getAttribute('placeholder') || e.getAttribute('aria-label') || '').trim().replace(/\\n/g, ' | ').slice(0, 110));
    out.push({ cls: (el.className || '').toString().slice(0, 80), role: el.getAttribute('role'), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), items: items.slice(0, 50) });
  }
  return out;
})()`;

const dump = async (tag) => {
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${OUT}/${tag}.png` });
  const d = await page.evaluate(OVERLAYS);
  fs.writeFileSync(`${OUT}/${tag}.json`, JSON.stringify(d, null, 1));
  log(`${tag}: overlays=${d.length} items=${d.reduce((a, r) => a + r.items.length, 0)}`);
};

try {
  const ok = await orviloLogin(page, BASE, (m) => log('D ' + m));
  log('D: login ok=' + ok);
  await page.goto(`${BASE}/agent-testing/task/APX-6`, {
    waitUntil: 'domcontentloaded',
    timeout: 90000,
  });
  await page.waitForSelector('text=Apollo: review inbox batch mutations', { timeout: 60000 });
  await page.waitForTimeout(4000);
  log('D: at ' + page.url());

  // header control HTML (now that page is surely rendered)
  const hdr = await page.evaluate(`(() => {
    const els = [...document.querySelectorAll('button, [role="button"], a')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&r.y<64&&r.x>240;});
    return els.map(e=>({x:Math.round(e.getBoundingClientRect().x),y:Math.round(e.getBoundingClientRect().y),w:Math.round(e.getBoundingClientRect().width),aria:e.getAttribute('aria-label'),text:(e.innerText||'').trim().slice(0,44),html:e.outerHTML.slice(0,320)}));
  })()`);
  fs.writeFileSync(`${OUT}/orvilo-30-header-buttons.json`, JSON.stringify(hdr, null, 1));
  log('D: header ' + hdr.length);

  // rail buttons
  const rail = await page.evaluate(`(() => {
    const els=[...document.querySelectorAll('button,[role="button"]')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.x>1330&&r.y<110;});
    return els.map(e=>({x:Math.round(e.getBoundingClientRect().x),y:Math.round(e.getBoundingClientRect().y),aria:e.getAttribute('aria-label'),title:e.getAttribute('title'),html:e.outerHTML.slice(0,260)}));
  })()`);
  fs.writeFileSync(`${OUT}/orvilo-31-rail-buttons.json`, JSON.stringify(rail, null, 1));

  // assignee picker
  await page
    .locator('[role="button"]:has-text("Agent Testing User")')
    .first()
    .click({ timeout: 10000 })
    .catch((e) => log('D assignee click ' + e.message.split('\n')[0]));
  await dump('orvilo-32-assignee-picker');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  // labels picker
  await page
    .locator('[role="button"]:has-text("Labels")')
    .first()
    .click({ timeout: 10000 })
    .catch((e) => log('D labels click ' + e.message.split('\n')[0]));
  await dump('orvilo-33-label-picker');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  // more menu: the ⋯ button right after the star in header. Find buttons y<64 sorted by x, click the one whose svg has ellipsis (circle elements) — fallback: click 2nd button after breadcrumb links.
  const moreInfo = await page.evaluate(`(() => {
    const btns = [...document.querySelectorAll('button')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.y<64&&r.x>240&&r.x<1300;});
    return btns.map((b,i)=>({i, x:Math.round(b.getBoundingClientRect().x), aria:b.getAttribute('aria-label'), title:b.getAttribute('title'), html:b.outerHTML.slice(0,200)}));
  })()`);
  fs.writeFileSync(`${OUT}/orvilo-34-header-btn-scan.json`, JSON.stringify(moreInfo, null, 1));
  log(
    'D: header btns ' +
      JSON.stringify(moreInfo.map((m) => [m.x, m.aria || m.title || '']).slice(0, 10)),
  );
  // click the ⋯ — find by lucide-ellipsis class
  await page.evaluate(`(() => {
    const btns=[...document.querySelectorAll('button')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.y<64&&r.x>240;});
    const ell = btns.find(b=>b.querySelector('svg.lucide-ellipsis, svg[class*="ellipsis" i], svg[class*="more-horizontal" i]'));
    (ell||btns[btns.length-1])?.click();
  })()`);
  await dump('orvilo-35-more-menu');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  // "Agent" button next to Run (assignee agent popover?)
  await page
    .locator('text=Agent')
    .last()
    .click({ timeout: 8000 })
    .catch(() => {});
  await dump('orvilo-36-agent-menu');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  // "Set schedule" row
  await page
    .locator('text=Set schedule')
    .first()
    .click({ timeout: 8000 })
    .catch(() => {});
  await dump('orvilo-37-schedule');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  // "Add sub-task" button
  await page
    .locator('text=Add sub-task')
    .first()
    .click({ timeout: 8000 })
    .catch(() => {});
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/orvilo-38-addsubtask.png` });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  // comment hover actions — scroll to comment then hover
  const cmt = page.locator('text=Blocking on the approval card').first();
  if (await cmt.count()) {
    await cmt.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(400);
    await cmt.hover();
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${OUT}/orvilo-39-comment-hover.png` });
    const hov = await page.evaluate(`(() => {
      const card=[...document.querySelectorAll('*')].find(()=>false);
      const els=[...document.querySelectorAll('button,[role="button"],[role="menuitem"],[role="tooltip"]')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&r.y>480;});
      return els.map(e=>({aria:e.getAttribute('aria-label'),title:e.getAttribute('title'),text:(e.innerText||'').trim().slice(0,44),x:Math.round(e.getBoundingClientRect().x),y:Math.round(e.getBoundingClientRect().y)}));
    })()`);
    fs.writeFileSync(`${OUT}/orvilo-39-comment-hover.json`, JSON.stringify(hov, null, 1));
    // try to open the comment's overflow menu (⋯ on hover)
    const ov = await page.evaluate(`(() => {
      const els=[...document.querySelectorAll('button')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.y>480&&r.y<900&&r.x>900;});
      const ell=els.find(b=>b.querySelector('svg.lucide-ellipsis, svg[class*="ellipsis" i]'));
      if(ell){ell.click();return 'clicked '+Math.round(ell.getBoundingClientRect().x)+','+Math.round(ell.getBoundingClientRect().y);}
      return 'none:'+els.length;
    })()`);
    log('D: comment overflow ' + ov);
    await dump('orvilo-40-comment-menu');
  }
  log('D: done');
} catch (e) {
  log('D ERR ' + e.message.split('\n')[0]);
}
fs.writeFileSync(`${OUT}/done-17.txt`, 'done');
process.exit(0);
