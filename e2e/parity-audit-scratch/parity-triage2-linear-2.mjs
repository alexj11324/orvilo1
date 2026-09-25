// Linear triage pass 2: icon details, Show-snoozed row hunt, fav button shape.
import { connect, shot } from './parity-triage-lib.mjs';
import fs from 'fs';
const DIR =
  '/Users/devin/repos/wt-parity-triage/.agents/runtime-acceptance/parity-2026-09-23/triage';
const R = {};
const dump = (k, v) => {
  R[k] = v;
  fs.writeFileSync(`${DIR}/linear-enum2.json`, JSON.stringify(R, null, 1));
};
const say = (m) => console.log(m);

const browser = await connect();
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto('https://linear.app/bdiverifier/team/ORV/triage', {
  waitUntil: 'domcontentloaded',
  timeout: 60000,
});
await page.waitForTimeout(7000);
say('URL ' + page.url());

// 1. header anatomy: everything in top 48px of the main pane
const headBits = await page.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.top > 48 || r.bottom < 8 || r.left < 245) continue;
    const tag = el.tagName.toLowerCase();
    if (el.children.length > 3 && !['button', 'a', 'svg', 'span'].includes(tag)) continue;
    const cs = getComputedStyle(el);
    out.push({
      tag,
      role: el.getAttribute('role'),
      aria: el.getAttribute('aria-label'),
      title: el.getAttribute('title'),
      text: (el.childNodes.length === 1 && el.childNodes[0].nodeType === 3
        ? el.textContent.trim()
        : tag === 'svg' || tag === 'img' || tag === 'button'
          ? el.textContent?.trim().slice(0, 30)
          : ''
      ).slice(0, 50),
      rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
      bg: cs.backgroundColor,
      color: cs.color,
      radius: cs.borderRadius,
      svg: el.tagName === 'svg' ? (el.getAttribute('class') || '').slice(0, 60) : undefined,
      cursor: cs.cursor,
    });
  }
  return out;
});
dump('headBits', headBits);

// 2. detail the triage header icon (the pink chip before "Triage")
const triageIcon = await page.evaluate(() => {
  const title = [...document.querySelectorAll('*')].find(
    (e) =>
      e.childNodes.length === 1 &&
      e.textContent?.trim() === 'Triage' &&
      e.getBoundingClientRect().top < 50 &&
      e.getBoundingClientRect().left > 245,
  );
  if (!title) return null;
  const tr = title.getBoundingClientRect();
  // find svg-ish element just left of title
  const out = [];
  for (const el of document.querySelectorAll('svg, [class*="icon" i], img, span')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0) continue;
    if (
      r.right <= tr.left + 2 &&
      r.right > tr.left - 30 &&
      Math.abs(r.y + r.height / 2 - (tr.y + tr.height / 2)) < 14
    ) {
      out.push({
        tag: el.tagName.toLowerCase(),
        cls: (el.getAttribute('class') || '').slice(0, 90),
        rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
        parentBg: getComputedStyle(el.parentElement).backgroundColor,
        parentRadius: getComputedStyle(el.parentElement).borderRadius,
        path: el.querySelector('path')?.getAttribute('d')?.slice(0, 120),
      });
    }
  }
  return { titleRect: [tr.x, tr.y, tr.width, tr.height], icons: out };
});
dump('triageIcon', triageIcon);

// 3. favorite star: exact shape
const fav = await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button,[role="switch"]')].find((e) =>
    /favorite/i.test(e.getAttribute('aria-label') || ''),
  );
  if (!btn) return null;
  const r = btn.getBoundingClientRect();
  const svg = btn.querySelector('svg');
  return {
    aria: btn.getAttribute('aria-label'),
    role: btn.getAttribute('role'),
    checked: btn.getAttribute('aria-checked'),
    rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
    svgPath: svg?.querySelector('path')?.getAttribute('d')?.slice(0, 140),
    svgCls: (svg?.getAttribute('class') || '').slice(0, 80),
  };
});
dump('fav', fav);

// 4. Display options -> toggle Show snoozed ON -> check for rows -> toggle back OFF
const dispPos = await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((e) =>
    /display options/i.test(e.getAttribute('aria-label') || ''),
  );
  if (!b) return null;
  const r = b.getBoundingClientRect();
  return [r.x + r.width / 2, r.y + r.height / 2];
});
if (dispPos) {
  await page.mouse.click(dispPos[0], dispPos[1]);
  await page.waitForTimeout(1200);
  // dump ordering select contents
  const pop = await page.evaluate(() => {
    const cands = [
      ...document.querySelectorAll(
        '[role="dialog"], [data-radix-popper-content-wrapper], [class*="popper" i], [data-state="open"]',
      ),
    ];
    return cands
      .filter((c) => {
        const r = c.getBoundingClientRect();
        return r.width > 100 && r.height > 60;
      })
      .map((c) => c.innerText.slice(0, 600));
  });
  dump('displayMenuText', pop);
  // find Show snoozed switch and flip ON
  const flipped = await page.evaluate(() => {
    const all = [...document.querySelectorAll('[role="switch"], button')];
    for (const el of all) {
      const host = el.closest('div');
      const label = (host?.textContent || '') + (el.getAttribute('aria-label') || '');
      if (/snooz/i.test(label)) {
        const r = el.getBoundingClientRect();
        if (r.width > 0)
          return {
            x: r.x + r.width / 2,
            y: r.y + r.height / 2,
            was: el.getAttribute('aria-checked'),
          };
      }
    }
    // fallback: locate the row containing 'Show snoozed' text then its switch
    const txt = [...document.querySelectorAll('*')].find(
      (e) => e.childNodes.length === 1 && /Show snoozed/i.test(e.textContent || ''),
    );
    if (txt) {
      const row = txt.closest('div')?.parentElement;
      const sw = row?.querySelector('[role="switch"], button');
      if (sw) {
        const r = sw.getBoundingClientRect();
        return {
          x: r.x + r.width / 2,
          y: r.y + r.height / 2,
          was: sw.getAttribute('aria-checked'),
        };
      }
    }
    return null;
  });
  say('snooze switch: ' + JSON.stringify(flipped));
  if (flipped) {
    await page.mouse.click(flipped.x, flipped.y);
    await page.waitForTimeout(2000);
    await shot(page, `${DIR}/shots/linear-07-snoozed-on.png`);
    const rowsNow = await page.evaluate(() => {
      const links = [...document.querySelectorAll('a[href*="/issue/"]')];
      return {
        count: links.length,
        sample: links.slice(0, 8).map((a) => a.textContent?.trim().slice(0, 90)),
      };
    });
    dump('snoozedRows', rowsNow);
    say('rows after snoozed ON: ' + rowsNow.count);
    // toggle back OFF to leave prefs as found
    await page.mouse.click(flipped.x, flipped.y);
    await page.waitForTimeout(800);
  }
  await page.keyboard.press('Escape');
}

// 5. does the list pane have its own header row when populated? (check ordering button inside display menu)
// also capture the split: measure the divider
const split = await page.evaluate(() => {
  // find the vertical divider between list and detail
  const els = [...document.querySelectorAll('div, [role="separator"], [class*="divider" i]')];
  const cands = els.filter((e) => {
    const r = e.getBoundingClientRect();
    return r.width <= 2 && r.height > 300 && r.left > 500 && r.left < 900 && r.top < 100;
  });
  return cands.map((c) => {
    const r = c.getBoundingClientRect();
    return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)];
  });
});
dump('splitDivider', split);

await page.close();
say('DONE');
process.exit(0);
