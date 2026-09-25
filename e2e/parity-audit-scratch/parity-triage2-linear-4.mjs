// Linear triage pass 4: toggle Show snoozed via text-anchor; dump popup DOM ancestry.
import { connect, shot } from './parity-triage-lib.mjs';
import fs from 'fs';
const DIR =
  '/Users/devin/repos/wt-parity-triage/.agents/runtime-acceptance/parity-2026-09-23/triage';
const R = {};
const dump = (k, v) => {
  R[k] = v;
  fs.writeFileSync(`${DIR}/linear-enum4.json`, JSON.stringify(R, null, 1));
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

await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((e) =>
    /display options/i.test(e.getAttribute('aria-label') || ''),
  );
  const r = b.getBoundingClientRect();
  window.__disp = [r.x + r.width / 2, r.y + r.height / 2];
});
const dp = await page.evaluate(() => window.__disp);
await page.mouse.click(dp[0], dp[1]);
await page.waitForTimeout(1500);

// text-anchored: find "Show snoozed" label then the switch in the same row
const swInfo = await page.evaluate(() => {
  const label = [...document.querySelectorAll('*')].find(
    (e) =>
      e.childNodes.length === 1 &&
      e.textContent?.trim() === 'Show snoozed' &&
      e.getBoundingClientRect().width > 0,
  );
  if (!label) return { found: false };
  // climb to a row container that also contains a clickable control
  let row = label;
  for (let i = 0; i < 6 && row.parentElement; i++) {
    row = row.parentElement;
    if (row.querySelector('[role="switch"], input[type="checkbox"], button')) break;
  }
  const ctl = row.querySelector('[role="switch"], input[type="checkbox"], button');
  const lr = label.getBoundingClientRect();
  const out = { found: true, labelRect: [lr.x, lr.y, lr.width, lr.height] };
  if (ctl) {
    const cr = ctl.getBoundingClientRect();
    out.ctl = {
      tag: ctl.tagName,
      role: ctl.getAttribute('role'),
      checked: ctl.getAttribute('aria-checked'),
      rect: [cr.x, cr.y, cr.width, cr.height],
    };
  }
  // also dump the popup container ancestry for evidence
  let pop = label;
  while (
    pop.parentElement &&
    !(getComputedStyle(pop).position === 'absolute' || getComputedStyle(pop).position === 'fixed')
  )
    pop = pop.parentElement;
  const pr = pop.getBoundingClientRect();
  out.popRect = [Math.round(pr.x), Math.round(pr.y), Math.round(pr.width), Math.round(pr.height)];
  out.popTag = pop.tagName + '.' + (pop.className || '').toString().slice(0, 80);
  out.popText = pop.innerText?.slice(0, 400);
  return out;
});
dump('snoozeRow', swInfo);
say('snooze: ' + JSON.stringify(swInfo));

if (swInfo.ctl) {
  const [x, y, w, h] = swInfo.ctl.rect;
  await page.mouse.click(x + w / 2, y + h / 2);
  await page.waitForTimeout(2500);
  await shot(page, `${DIR}/shots/linear-09-snoozed-on.png`);
  const rowsNow = await page.evaluate(() => {
    const links = [...document.querySelectorAll('a[href*="/issue/"]')].filter(
      (a) => a.getBoundingClientRect().width > 0,
    );
    const generic = [...document.querySelectorAll('[role="row"], li, [class*="row" i]')].filter(
      (e) => {
        const r = e.getBoundingClientRect();
        return r.width > 200 && r.top > 60 && r.left > 240;
      },
    );
    return {
      issueLinks: links.length,
      rowish: generic.length,
      sample: links.slice(0, 8).map((a) => a.textContent?.trim().slice(0, 80)),
    };
  });
  dump('snoozedRows', rowsNow);
  say('after ON: ' + JSON.stringify(rowsNow).slice(0, 300));
  // revert
  await page.mouse.click(x + w / 2, y + h / 2);
  await page.waitForTimeout(900);
  say('reverted');
} else {
  // fallback: click where the switch was seen in the screenshot (~606,123)
  say('no ctl found; trying coord (606,123)');
  await page.mouse.click(606, 123);
  await page.waitForTimeout(2500);
  await shot(page, `${DIR}/shots/linear-09-snoozed-on.png`);
  const rowsNow = await page.evaluate(
    () =>
      [...document.querySelectorAll('a[href*="/issue/"]')].filter(
        (a) => a.getBoundingClientRect().width > 0,
      ).length,
  );
  say('after ON rows: ' + rowsNow);
  await page.mouse.click(606, 123);
  await page.waitForTimeout(900);
}
await page.keyboard.press('Escape');
await page.close();
say('DONE');
process.exit(0);
