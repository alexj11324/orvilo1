// Linear triage pass 5: create-composer reaction + keyboard-shortcut hints.
import { chromium } from 'playwright';
import fs from 'fs';
const DIR =
  '/Users/devin/repos/wt-parity-triage/.agents/runtime-acceptance/parity-2026-09-23/triage';
const R = {};
const dump = (k, v) => {
  R[k] = v;
  fs.writeFileSync(`${DIR}/linear-enum5.json`, JSON.stringify(R, null, 1));
};
const say = (m) => console.log(m);
const shot = (page, p) =>
  page.screenshot({ path: p, timeout: 10000 }).catch(() => say('shot skip ' + p));

let browser = null;
for (let i = 0; i < 12; i++) {
  try {
    browser = await chromium.connectOverCDP('http://localhost:9222', { timeout: 60000 });
    break;
  } catch (e) {
    say('connect ' + i);
    await new Promise((r) => setTimeout(r, 5000));
  }
}
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto('https://linear.app/bdiverifier/team/ORV/triage', {
  waitUntil: 'domcontentloaded',
  timeout: 60000,
});
await page.waitForTimeout(7000);

// 1. "Create triage issue" → composer opens (READ-ONLY: close without submit)
const createPos = await page.evaluate(() => {
  const b = [...document.querySelectorAll('button, [role="button"], a')].find(
    (e) => /create triage issue/i.test(e.textContent || '') && e.getBoundingClientRect().width > 0,
  );
  if (!b) return null;
  const r = b.getBoundingClientRect();
  return [r.x + r.width / 2, r.y + r.height / 2];
});
say('createPos ' + JSON.stringify(createPos));
if (createPos) {
  await page.mouse.click(createPos[0], createPos[1]);
  await page.waitForTimeout(2500);
  await shot(page, `${DIR}/shots/linear-10-create-composer.png`);
  const composer = await page.evaluate(() => {
    // biggest visible overlay
    const cands = [
      ...document.querySelectorAll(
        '[role="dialog"], [data-state="open"], [class*="modal" i], [class*="Modal"], [class*="popper" i]',
      ),
    ];
    let best = null;
    for (const d of cands) {
      const r = d.getBoundingClientRect();
      if (r.width > 300 && r.height > 150 && (!best || r.width * r.height > best.area))
        best = { d, area: r.width * r.height, r };
    }
    if (!best) return null;
    return {
      rect: [
        Math.round(best.r.x),
        Math.round(best.r.y),
        Math.round(best.r.width),
        Math.round(best.r.height),
      ],
      text: best.d.innerText.slice(0, 700),
    };
  });
  dump('composer', composer);
  say('composer: ' + JSON.stringify(composer?.text?.slice(0, 200)));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
}

// 2. keyboard shortcuts dialog (?)
await page.mouse.click(900, 500); // neutral spot in detail pane
await page.waitForTimeout(400);
await page.keyboard.press('?');
await page.waitForTimeout(2000);
await shot(page, `${DIR}/shots/linear-11-kbd.png`);
const kbd = await page.evaluate(() => {
  const cands = [
    ...document.querySelectorAll(
      '[role="dialog"], [class*="modal" i], [data-state="open"], body > div',
    ),
  ];
  let best = null;
  for (const d of cands) {
    const r = d.getBoundingClientRect();
    if (r.width > 380 && r.height > 280 && (!best || r.width * r.height > best.area))
      best = { d, area: r.width * r.height, r };
  }
  if (!best) return null;
  const rows = [];
  best.d.querySelectorAll('*').forEach((el) => {
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
  return {
    rect: [
      Math.round(best.r.x),
      Math.round(best.r.y),
      Math.round(best.r.width),
      Math.round(best.r.height),
    ],
    rows: rows.slice(0, 120),
  };
});
dump('kbd', kbd);
say('kbd rows: ' + (kbd?.rows?.length ?? 0));
// print triage-relevant ones
if (kbd) {
  for (const r of kbd.rows) {
    if (/triage|accept|decline|snooze|select|move|navigate|next|prev|open/i.test(r.text))
      console.log('KBD:', JSON.stringify(r));
  }
}
await page.keyboard.press('Escape');
await page.close();
say('DONE');
process.exit(0);
