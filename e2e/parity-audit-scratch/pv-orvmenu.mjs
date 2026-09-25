import { chromium } from 'playwright';
import fs from 'node:fs';
const OUT = '/Users/devin/repos/wt-parity-views/.agents/runtime-acceptance/parity-2026-09-23/views';
const b = await chromium.connectOverCDP('http://localhost:9222', { timeout: 120000 });
const p = await b.contexts()[0].newPage();
p.setDefaultTimeout(30000);
const popupFn = () => {
  const out = [];
  for (const el of document.querySelectorAll(
    '[role=menu],[role=dialog],[role=listbox],[class*=popover],[class*=Popover],[class*=dropdown],[class*=Dropdown]',
  )) {
    const r = el.getBoundingClientRect();
    if (r.width < 20 || r.height < 20) continue;
    const rows = [];
    for (const item of el.querySelectorAll(
      '[role=menuitem],[role=option],[role=menuitemcheckbox],[role=menuitemradio],li,button',
    )) {
      const ir = item.getBoundingClientRect();
      if (ir.width === 0) continue;
      const svg = item.querySelector('svg');
      rows.push({
        role: item.getAttribute('role'),
        tag: item.tagName.toLowerCase(),
        text: (item.innerText || '').trim().slice(0, 60),
        icon: svg ? (svg.getAttribute('class') || '').slice(0, 50) : null,
        x: Math.round(ir.x),
        y: Math.round(ir.y),
      });
    }
    out.push({
      sel: el.getAttribute('role') || el.className.toString().slice(0, 40),
      w: Math.round(r.width),
      h: Math.round(r.height),
      x: Math.round(r.x),
      y: Math.round(r.y),
      text: el.innerText.trim().slice(0, 1200),
      rows,
    });
  }
  return out;
};
try {
  await p.goto('http://localhost:3010/agent-testing/views/svparityvol0001', {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await p.waitForTimeout(9000);
  // the real ⋯ view options menu (aria-label="View options")
  const menu = p.locator('button[aria-label="View options"]');
  const n = await menu.count();
  if (n) {
    await menu.first().click();
    await p.waitForTimeout(1300);
    await p.screenshot({ path: `${OUT}/orv-detail-viewmenu.png` });
    fs.writeFileSync(
      `${OUT}/orv-detail-viewmenu-items.json`,
      JSON.stringify(await p.evaluate(popupFn), null, 1),
    );
    await p.keyboard.press('Escape');
    await p.waitForTimeout(500);
  }
  fs.writeFileSync('/tmp/pv-orvmenu.json', JSON.stringify({ menuCount: n }));
  // aside structure
  const aside = await p.evaluate(() => {
    const a = document.querySelector('aside');
    if (!a) return null;
    const btns = [...a.querySelectorAll('button')].map((x) => ({
      aria: x.getAttribute('aria-label'),
      text: (x.innerText || '').trim().slice(0, 40),
      x: Math.round(x.getBoundingClientRect().x),
      y: Math.round(x.getBoundingClientRect().y),
    }));
    return { text: a.innerText.slice(0, 1500), rect: a.getBoundingClientRect().toJSON(), btns };
  });
  fs.writeFileSync(`${OUT}/orv-pane-detail.json`, JSON.stringify(aside, null, 1));
} finally {
  await p.close();
  await b.close();
}
