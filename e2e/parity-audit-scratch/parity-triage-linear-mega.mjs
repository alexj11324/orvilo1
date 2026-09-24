import fs from 'fs';
const DIR = '/tmp/parity-audit-2026-09-23/triage';
const R = { steps: {}, log: [] };
const dump = (k, v) => {
  R.steps[k] = v;
  fs.writeFileSync(`${DIR}/linear-mega.json`, JSON.stringify(R, null, 1));
};
const say = (m) => {
  R.log.push(m);
  console.log(m);
  fs.writeFileSync(`${DIR}/linear-mega.json`, JSON.stringify(R, null, 1));
};

import { chromium } from 'playwright';
let browser = null;
for (let i = 0; i < 60; i++) {
  try {
    browser = await chromium.connectOverCDP('http://127.0.0.1:9222', { timeout: 60000 });
    break;
  } catch (e) {
    say(`connect ${i} fail ${e.message.slice(0, 60)}`);
    await new Promise((r) => setTimeout(r, 10000));
  }
}
if (!browser) {
  say('CDP DEAD');
  process.exit(1);
}
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
await page.setViewportSize({ width: 1440, height: 900 });
const shot = (n) =>
  page.screenshot({ path: `${DIR}/${n}.png`, timeout: 8000 }).catch(() => say(`shot-skip ${n}`));

await page.goto('https://linear.app/bdiverifier/team/ORV/triage', {
  waitUntil: 'domcontentloaded',
  timeout: 60000,
});
await page.waitForTimeout(6000);
say('loaded ' + page.url());

// --- favorites state check ---
const fav = await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button,[role="switch"],[role="button"]')].find((e) =>
    /favorite/i.test(e.getAttribute('aria-label') || ''),
  );
  return btn
    ? {
        aria: btn.getAttribute('aria-label'),
        checked: btn.getAttribute('aria-checked'),
        pressed: btn.getAttribute('aria-pressed'),
      }
    : null;
});
dump('favorites', fav);

// --- sidebar favorites entries ---
const sideFav = await page.evaluate(() => {
  const nav = document.querySelector('nav') || document.body;
  return [...nav.querySelectorAll('a, [role="link"], [role="treeitem"]')]
    .map((a) => a.textContent.trim())
    .filter((t) => t && t.length < 40);
});
dump('sidebarItems', sideFav.slice(0, 60));

// --- Open Help (?) menu and read it ---
await page.mouse.click(440, 300);
await page.waitForTimeout(400);
await page.keyboard.press('?');
await page.waitForTimeout(1500);
const helpMenu = await page.evaluate(() => {
  const cands = [
    ...document.querySelectorAll(
      '[role="menu"], [role="dialog"], [data-state="open"], [class*="popper" i], [class*="popover" i], [data-radix-popper-content-wrapper]',
    ),
  ];
  const out = [];
  for (const c of cands) {
    const r = c.getBoundingClientRect();
    if (r.width < 150 || r.height < 100) continue;
    out.push({
      rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
      text: c.innerText.slice(0, 1500),
    });
  }
  return out;
});
dump('helpMenu', helpMenu);
await shot('linear-helpmenu');

// click "Keyboard shortcuts" item
const ksPos = await page.evaluate(() => {
  const els = [...document.querySelectorAll('*')].filter((e) => {
    const r = e.getBoundingClientRect();
    return (
      r.width > 0 &&
      e.children.length < 4 &&
      /Keyboard shortcuts/i.test(e.textContent || '') &&
      (e.textContent || '').length < 60
    );
  });
  if (!els.length) return null;
  const r = els[els.length - 1].getBoundingClientRect();
  return [r.x, r.y, r.width, r.height];
});
say('ksPos=' + JSON.stringify(ksPos));
if (ksPos) {
  await page.mouse.click(ksPos[0] + ksPos[2] / 2, ksPos[1] + ksPos[3] / 2);
  await page.waitForTimeout(2000);
  await shot('linear-kbdialog');
  const kb = await page.evaluate(() => {
    const cands = [
      ...document.querySelectorAll(
        'body > div, [role="dialog"], [data-state="open"], [class*="modal" i], [class*="Modal"]',
      ),
    ];
    let best = null;
    for (const d of cands) {
      const r = d.getBoundingClientRect();
      if (r.width > 380 && r.height > 280) {
        const area = r.width * r.height;
        if (!best || area > best.area) best = { el: d, area, r };
      }
    }
    if (!best) return null;
    const rows = [];
    best.el.querySelectorAll('*').forEach((el) => {
      const kbs = [...el.children].filter((k) => k.tagName === 'KBD');
      const ownText = [...el.childNodes]
        .filter((n) => n.nodeType === 3)
        .map((n) => n.textContent.trim())
        .filter(Boolean)
        .join(' ');
      if (kbs.length && ownText)
        rows.push({
          text: ownText.slice(0, 70),
          keys: kbs.map((k) => k.textContent.trim()).join(' '),
        });
    });
    // also grab section headers
    const headers = [];
    best.el.querySelectorAll('*').forEach((el) => {
      const ownText = [...el.childNodes]
        .filter((n) => n.nodeType === 3)
        .map((n) => n.textContent.trim())
        .filter(Boolean)
        .join(' ');
      if (ownText && el.children.length === 0 && !el.closest('kbd'))
        headers.push(ownText.slice(0, 50));
    });
    return {
      rect: [
        Math.round(best.r.x),
        Math.round(best.r.y),
        Math.round(best.r.width),
        Math.round(best.r.height),
      ],
      headers: headers.slice(0, 60),
      rows,
    };
  });
  dump('kbdDialog', kb);
}
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
await page.close();
say('DONE');
process.exit(0);
