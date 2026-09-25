// Orvilo triage — settle-aware enumeration. READ-ONLY.
import { connect, shot } from './parity-triage-lib.mjs';
import fs from 'fs';
const DIR =
  '/Users/devin/repos/wt-parity-triage/.agents/runtime-acceptance/parity-2026-09-23/triage';
const R = {};
const dump = (k, v) => {
  R[k] = v;
  fs.writeFileSync(`${DIR}/orvilo-enum2.json`, JSON.stringify(R, null, 1));
};
const say = (m) => console.log(m);

const TEAM = process.env.TRIAGE_TEAM || 'team_KNsVSioFk8hO';
const browser = await connect();
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
await page.setViewportSize({ width: 1440, height: 900 });

await page.goto(`http://localhost:3010/agent-testing/teams/${TEAM}?tab=triage`, {
  waitUntil: 'domcontentloaded',
  timeout: 45000,
});
// settle: wait until header shows "Triage" AND (rows or empty-state or error) appear
let settled = false;
for (let i = 0; i < 25; i++) {
  await page.waitForTimeout(2000);
  const s = await page
    .evaluate(() => {
      const t = document.body?.innerText || '';
      const mainText = document.body?.innerText || '';
      const hasTriageTitle = /^Triage$/m.test(mainText) || mainText.includes('Triage');
      const hasRows = !!document.querySelector('a[href*="/task/"]');
      const hasEmpty = /Nothing waiting to be triaged|Create triage issue/i.test(mainText);
      const hasErr = /retry|went wrong|failed/i.test(mainText);
      const busy = !!document.querySelector('[aria-label*="Loading" i], [class*="skeleton" i]');
      return { hasTriageTitle, hasRows, hasEmpty, hasErr, busy, len: mainText.length };
    })
    .catch(() => ({ err: true }));
  say(`t=${(i + 1) * 2}s ${JSON.stringify(s)}`);
  if (s.hasTriageTitle && (s.hasRows || s.hasErr || (s.hasEmpty && !s.busy))) {
    settled = true;
    break;
  }
}
say('settled=' + settled + ' url=' + page.url());
await shot(page, `${DIR}/shots/orvilo-01-full.png`);

// header controls
const header = await page.evaluate(() => {
  const out = { buttons: [], text: '' };
  const hdr =
    document.querySelector('main header, [role="main"] header') || document.querySelector('header');
  if (hdr) {
    out.text = hdr.innerText.slice(0, 300);
    for (const el of hdr.querySelectorAll(
      'a, button, [role="button"], [role="tab"], [role="switch"], input',
    )) {
      const r = el.getBoundingClientRect();
      if (r.width === 0) continue;
      out.buttons.push({
        tag: el.tagName.toLowerCase(),
        role: el.getAttribute('role'),
        aria: el.getAttribute('aria-label'),
        title: el.getAttribute('title'),
        href: el.getAttribute('href'),
        text: el.textContent?.trim().slice(0, 60),
        rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
        svgCount: el.querySelectorAll('svg').length,
      });
    }
  }
  return out;
});
dump('header', header);

// rows: anchor children structure
const rows = await page.evaluate(() => {
  const out = [];
  for (const a of document.querySelectorAll('a[href*="/task/"]')) {
    const r = a.getBoundingClientRect();
    if (r.width === 0) continue;
    // climb to the row container (parent flexbox)
    let row = a;
    for (let i = 0; i < 5 && row.parentElement; i++) {
      if (row.parentElement.querySelectorAll('button').length) {
        row = row.parentElement;
        break;
      }
      row = row.parentElement;
    }
    const rr = row.getBoundingClientRect();
    out.push({
      linkText: a.textContent?.trim().slice(0, 90),
      href: a.getAttribute('href'),
      rowRect: [Math.round(rr.x), Math.round(rr.y), Math.round(rr.width), Math.round(rr.height)],
      rowText: row.textContent?.trim().slice(0, 140),
      buttons: [...row.querySelectorAll('button, [role="button"]')]
        .map((b) => {
          const br = b.getBoundingClientRect();
          return {
            text: b.textContent?.trim().slice(0, 40),
            aria: b.getAttribute('aria-label'),
            title: b.getAttribute('title'),
            disabled: b.disabled || b.getAttribute('aria-disabled') === 'true',
            rect: [Math.round(br.x), Math.round(br.y), Math.round(br.width), Math.round(br.height)],
            svg: b.querySelectorAll('svg').length,
          };
        })
        .filter((b) => b.rect[2] > 0),
      svgs: [...row.querySelectorAll('svg')].length,
    });
  }
  return out.slice(0, 15);
});
dump('rows', rows);
say('rows: ' + rows.length);

// hover first row
if (rows.length) {
  const y = rows[0].rowRect[1] + rows[0].rowRect[3] / 2;
  await page.mouse.move(rows[0].rowRect[0] + 300, y);
  await page.waitForTimeout(1200);
  await shot(page, `${DIR}/shots/orvilo-02-row-hover.png`);
  const after = await page.evaluate(
    (rowY) => {
      const out = [];
      for (const el of document.querySelectorAll('button, [role="button"]')) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || Math.abs(r.y + r.height / 2 - rowY) > 26) continue;
        out.push({
          text: el.textContent?.trim().slice(0, 40),
          aria: el.getAttribute('aria-label'),
          title: el.getAttribute('title'),
          disabled: el.disabled,
          rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
        });
      }
      return out;
    },
    rows[0].rowRect[1] + rows[0].rowRect[3] / 2,
  );
  dump('rowHover', after);
}

// open the row "More triage actions" menu
if (rows.length) {
  const pos = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((e) =>
      /more triage|more actions/i.test(
        (e.getAttribute('title') || '') + (e.getAttribute('aria-label') || ''),
      ),
    );
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return [r.x + r.width / 2, r.y + r.height / 2];
  });
  say('more menu pos: ' + JSON.stringify(pos));
  if (pos) {
    await page.mouse.click(pos[0], pos[1]);
    await page.waitForTimeout(1200);
    await shot(page, `${DIR}/shots/orvilo-03-row-menu.png`);
    const menu = await page.evaluate(() => {
      const out = [];
      for (const c of document.querySelectorAll(
        '[role="menu"], [role="listbox"], .ant-dropdown-menu, [class*="popover" i], [data-state="open"]',
      )) {
        const r = c.getBoundingClientRect();
        if (r.width < 80 || r.height < 30 || r.top < 40) continue;
        const rows = [];
        for (const el of c.querySelectorAll('[role="menuitem"], li, button, [class*="item" i]')) {
          const er = el.getBoundingClientRect();
          if (er.width === 0 || er.height === 0) continue;
          rows.push({
            tag: el.tagName.toLowerCase(),
            role: el.getAttribute('role'),
            text: el.textContent?.trim().slice(0, 60),
            rect: [Math.round(er.x), Math.round(er.y), Math.round(er.width), Math.round(er.height)],
          });
        }
        out.push({
          rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
          allText: c.textContent.slice(0, 400),
          rows,
        });
      }
      return out;
    });
    dump('rowMenu', menu);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  }
}

// empty state check
const misc = await page.evaluate(() => {
  const t = document.querySelector('main')?.innerText || document.body.innerText;
  return { snip: t.slice(0, 500), hasEmpty: /Nothing waiting|Nothing to triage/i.test(t) };
});
dump('misc', misc);

await page.close();
say('DONE');
process.exit(0);
