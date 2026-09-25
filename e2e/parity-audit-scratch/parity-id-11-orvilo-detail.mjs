// Orvilo task-detail audit — single resilient session.
// 1. connect w/ retry; 2. open tasks list, find task links; 3. open a task,
//    inventory + screenshots; 4. open each picker/menu, dump + screenshot.
import { chromium } from 'playwright';
import fs from 'node:fs';
const OUT = '/tmp/parity-audit-2026-09-23/issue-detail';
const log = (m) => {
  try {
    fs.appendFileSync(`${OUT}/audit-log.txt`, `${new Date().toISOString()} ${m}\n`);
  } catch {}
};

async function connect() {
  for (let i = 0; i < 8; i++) {
    try {
      const b = await chromium.connectOverCDP('http://localhost:9222', { timeout: 60000 });
      return b;
    } catch (e) {
      log(`O3: connect attempt ${i} failed: ${e.message.split('\n')[0]}`);
      await new Promise((r) => setTimeout(r, 15000));
    }
  }
  throw new Error('cannot connect to CDP');
}

const browser = await connect();
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
await page.setViewportSize({ width: 1440, height: 900 });
log('O3: tab');

const INV = `(() => {
  const els = [...document.querySelectorAll('a[href], button, [role="button"], [role="tab"], [role="menuitem"], [role="checkbox"], [role="switch"], [role="combobox"], input, [contenteditable="true"], [data-testid]')];
  return els.filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; }).map(e => ({
    tag: e.tagName.toLowerCase(), role: e.getAttribute('role'),
    text: (e.innerText || e.value || e.getAttribute('placeholder') || '').trim().slice(0, 80).replace(/\\n/g,' | '),
    aria: e.getAttribute('aria-label'), href: e.getAttribute('href'), testid: e.getAttribute('data-testid'),
    x: Math.round(e.getBoundingClientRect().x), y: Math.round(e.getBoundingClientRect().y),
    w: Math.round(e.getBoundingClientRect().width), h: Math.round(e.getBoundingClientRect().height),
  }));
})()`;

const MENUS = `(() => {
  const roots = [...document.querySelectorAll('[role="menu"], [role="listbox"], [data-radix-popper-content-wrapper], .ant-dropdown, .ant-popover')].filter(e=>{const r=e.getBoundingClientRect();return r.width>10&&r.height>10;});
  return roots.map(root => {
    const rect = root.getBoundingClientRect();
    const items = [...root.querySelectorAll('[role="menuitem"],[role="option"],[role="menuitemcheckbox"],[role="menuitemradio"],[role="separator"],li,button,.ant-dropdown-menu-item,input')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0;});
    return {x:Math.round(rect.x),y:Math.round(rect.y),w:Math.round(rect.width),h:Math.round(rect.height),items:items.slice(0,60).map(e=>({role:e.getAttribute('role')||e.tagName.toLowerCase(),text:(e.innerText||e.getAttribute('placeholder')||e.getAttribute('aria-label')||'').trim().slice(0,100).replace(/\\n/g,' | '),checked:e.getAttribute('aria-checked')??e.getAttribute('aria-selected'),disabled:e.getAttribute('aria-disabled')||(e.disabled===true?'true':undefined)}))};
  });
})()`;

const dump = async (tag) => {
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/${tag}.png` });
  const d = await page.evaluate(MENUS);
  fs.writeFileSync(`${OUT}/${tag}.json`, JSON.stringify(d, null, 1));
  log(`${tag}: roots=${d.length}`);
};

try {
  await page.goto('http://localhost:3010/agent-testing/tasks', {
    waitUntil: 'domcontentloaded',
    timeout: 120000,
  });
  await page.waitForTimeout(12000);
  if (page.url().includes('/signin')) {
    log('O3: signed out — aborting, login handled separately');
    fs.writeFileSync(`${OUT}/done-11.txt`, 'signed-out');
    process.exit(0);
  }
  await page.screenshot({ path: `${OUT}/orvilo-00-tasks.png` });

  // collect candidate task links — anchors or rows with identifier text
  const links = await page.evaluate(() => {
    const out = [];
    for (const a of document.querySelectorAll('a[href]')) {
      const h = a.getAttribute('href') || '';
      if (/\/task\//.test(h))
        out.push({ href: h, text: (a.innerText || '').trim().slice(0, 110).replace(/\n/g, ' | ') });
    }
    return out;
  });
  fs.writeFileSync(`${OUT}/orvilo-task-links.json`, JSON.stringify(links, null, 1));
  log(`O3: task links=${links.length}`);

  // choose a populated-looking task: prefer one whose text is longest / has comments hints
  const target = links.find((l) => /PARITY|PMI/.test(l.text)) || links[0];
  if (!target) {
    log('O3: no task links');
    fs.writeFileSync(`${OUT}/done-11.txt`, 'no-links');
    process.exit(0);
  }
  log('O3: target ' + JSON.stringify(target));

  const taskUrl = target.href.startsWith('http')
    ? target.href
    : `http://localhost:3010${target.href}`;
  await page.goto(taskUrl, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForTimeout(12000);
  fs.writeFileSync(`${OUT}/orvilo-task-url.txt`, page.url());
  await page.screenshot({ path: `${OUT}/orvilo-10-detail-top.png` });
  const inv = await page.evaluate(INV);
  fs.writeFileSync(`${OUT}/orvilo-10-inventory.json`, JSON.stringify(inv, null, 1));
  log(`O3: detail inv=${inv.length} url=${page.url()}`);

  // scroll container → activity bottom
  const sc = await page.evaluate(() => {
    const cands = [...document.querySelectorAll('div, main, section')].filter(
      (e) => e.scrollHeight > e.clientHeight + 200 && e.clientHeight > 200,
    );
    const best = cands.sort((a, b) => b.scrollHeight - a.scrollHeight)[0];
    if (best) {
      best.scrollTop = best.scrollHeight;
      return { cls: (best.className || '').toString().slice(0, 80), sh: best.scrollHeight };
    }
    return null;
  });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/orvilo-11-detail-bottom.png` });
  log('O3: scrolled ' + JSON.stringify(sc));
  await page.evaluate(() => {
    const cands = [...document.querySelectorAll('div, main, section')].filter(
      (e) => e.scrollHeight > e.clientHeight + 200 && e.clientHeight > 200,
    );
    const best = cands.sort((a, b) => b.scrollHeight - a.scrollHeight)[0];
    if (best) best.scrollTop = 0;
  });
  await page.waitForTimeout(800);
} catch (e) {
  log('O3 ERR ' + e.message);
}
fs.writeFileSync(`${OUT}/done-11.txt`, 'done');
process.exit(0);
