// Linear "All issues" — capture standard issue-row anatomy + hover controls + context menu.
// Triage rows reuse this row family; triage-specific buttons (accept/decline/snooze) get added.
import { chromium } from 'playwright';
const connect = async (attempts = 8) => {
  for (let i = 0; i < attempts; i++) {
    try {
      return await chromium.connectOverCDP('http://localhost:9222', { timeout: 60000 });
    } catch (e) {
      console.log('connect ' + i + ' fail ' + e.message.slice(0, 60));
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
  throw new Error('CDP unreachable');
};
const shot = (page, p) =>
  page.screenshot({ path: p, timeout: 8000 }).catch(() => console.log('shot skip ' + p));

import fs from 'fs';
const DIR =
  '/Users/devin/repos/wt-parity-triage/.agents/runtime-acceptance/parity-2026-09-23/triage';
const R = {};
const dump = (k, v) => {
  R[k] = v;
  fs.writeFileSync(`${DIR}/linear-issues-enum.json`, JSON.stringify(R, null, 1));
};
const say = (m) => console.log(m);

const browser = await connect();
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto('https://linear.app/bdiverifier/team/ORV/all', {
  waitUntil: 'domcontentloaded',
  timeout: 60000,
});
await page.waitForTimeout(8000);
say('URL ' + page.url());
await shot(page, `${DIR}/shots/linear-issues-01.png`);

// rows
const rows = await page.evaluate(() => {
  const out = [];
  const links = [...document.querySelectorAll('a[href*="/issue/"]')].filter(
    (a) => a.getBoundingClientRect().width > 0,
  );
  const seen = new Set();
  for (const a of links.slice(0, 6)) {
    const r = a.getBoundingClientRect();
    if (seen.has(Math.round(r.y))) continue;
    seen.add(Math.round(r.y));
    let row = a;
    for (let i = 0; i < 8 && row.parentElement; i++) {
      if (
        row.parentElement.querySelectorAll('button,[role="button"],[role="checkbox"],input')
          .length > 1
      ) {
        row = row.parentElement;
        break;
      }
      row = row.parentElement;
    }
    const rr = row.getBoundingClientRect();
    out.push({
      text: row.textContent?.trim().slice(0, 140),
      rect: [Math.round(rr.x), Math.round(rr.y), Math.round(rr.width), Math.round(rr.height)],
      controls: [
        ...row.querySelectorAll(
          'button, [role="button"], [role="checkbox"], input, [role="combobox"], select',
        ),
      ]
        .map((b) => {
          const br = b.getBoundingClientRect();
          return {
            tag: b.tagName.toLowerCase(),
            role: b.getAttribute('role'),
            aria: b.getAttribute('aria-label'),
            title: b.getAttribute('title'),
            text: b.textContent?.trim().slice(0, 40),
            rect: [Math.round(br.x), Math.round(br.y), Math.round(br.width), Math.round(br.height)],
            svg: b.querySelectorAll('svg').length,
          };
        })
        .filter((c) => c.rect[2] > 0),
    });
  }
  return out;
});
dump('issueRows', rows);
say('rows: ' + rows.length);
if (rows[0]) console.log('ROW0: ' + JSON.stringify(rows[0], null, 1).slice(0, 3000));

// hover first row
if (rows.length) {
  const y = rows[0].rect[1] + rows[0].rect[3] / 2;
  await page.mouse.move(rows[0].rect[0] + 250, y);
  await page.waitForTimeout(1500);
  await shot(page, `${DIR}/shots/linear-issues-02-hover.png`);
  const hover = await page.evaluate((rowY) => {
    const out = [];
    for (const el of document.querySelectorAll(
      'button, [role="button"], [role="checkbox"], [role="combobox"]',
    )) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || Math.abs(r.y + r.height / 2 - rowY) > 26) continue;
      out.push({
        tag: el.tagName.toLowerCase(),
        role: el.getAttribute('role'),
        aria: el.getAttribute('aria-label'),
        title: el.getAttribute('title'),
        text: el.textContent?.trim().slice(0, 40),
        rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
        svg: el.querySelectorAll('svg').length,
      });
    }
    return out;
  }, y);
  dump('issueRowHover', hover);
  say('hover controls: ' + JSON.stringify(hover));
}
await page.close();
say('DONE');
process.exit(0);
