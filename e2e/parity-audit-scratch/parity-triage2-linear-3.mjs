// Linear triage pass 3: precise Show-snoozed toggle inside the display popup.
import { connect, shot } from './parity-triage-lib.mjs';
import fs from 'fs';
const DIR =
  '/Users/devin/repos/wt-parity-triage/.agents/runtime-acceptance/parity-2026-09-23/triage';
const R = {};
const dump = (k, v) => {
  R[k] = v;
  fs.writeFileSync(`${DIR}/linear-enum3.json`, JSON.stringify(R, null, 1));
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

// open Display options
const dispPos = await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((e) =>
    /display options/i.test(e.getAttribute('aria-label') || ''),
  );
  if (!b) return null;
  const r = b.getBoundingClientRect();
  return [r.x + r.width / 2, r.y + r.height / 2];
});
say('dispPos ' + JSON.stringify(dispPos));
await page.mouse.click(dispPos[0], dispPos[1]);
await page.waitForTimeout(1500);
await shot(page, `${DIR}/shots/linear-08-display-open.png`);

// enumerate popup contents with elementFromPoint-safe scan limited to popper wrappers
const popInfo = await page.evaluate(() => {
  const pops = [
    ...document.querySelectorAll(
      '[data-radix-popper-content-wrapper], [role="dialog"], [class*="popper" i], [data-state="open"]',
    ),
  ].filter((c) => {
    const r = c.getBoundingClientRect();
    return r.width > 100 && r.height > 60;
  });
  return pops.map((c) => {
    const r = c.getBoundingClientRect();
    const switches = [...c.querySelectorAll('[role="switch"], input[type="checkbox"], button')]
      .map((el) => {
        const er = el.getBoundingClientRect();
        return {
          tag: el.tagName,
          role: el.getAttribute('role'),
          aria: el.getAttribute('aria-label'),
          checked: el.getAttribute('aria-checked'),
          text: el.textContent?.trim().slice(0, 40),
          rect: er.width
            ? [Math.round(er.x), Math.round(er.y), Math.round(er.width), Math.round(er.height)]
            : null,
        };
      })
      .filter((s) => s.rect);
    const chips = [...c.querySelectorAll('*')]
      .filter((e) => {
        const er = e.getBoundingClientRect();
        return (
          er.width > 0 &&
          e.children.length === 0 &&
          /^(ID|Due date|Added to triage|Show snoozed|Ordering|Display properties)$/i.test(
            e.textContent?.trim() || '',
          )
        );
      })
      .map((e) => ({
        text: e.textContent.trim(),
        rect: (() => {
          const r = e.getBoundingClientRect();
          return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)];
        })(),
      }));
    return {
      rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
      text: c.innerText.slice(0, 400),
      switches,
      chips,
    };
  });
});
dump('displayPop', popInfo);
say('pops: ' + popInfo.length + ' switches: ' + JSON.stringify(popInfo[0]?.switches));

// find the switch inside the popup (x > 300 to avoid sidebar)
const sw = popInfo.flatMap((p) => p.switches).find((s) => s.rect[0] > 300);
if (sw) {
  say('clicking switch at ' + JSON.stringify(sw.rect) + ' checked=' + sw.checked);
  await page.mouse.click(sw.rect[0] + sw.rect[2] / 2, sw.rect[1] + sw.rect[3] / 2);
  await page.waitForTimeout(2500);
  await shot(page, `${DIR}/shots/linear-09-snoozed-on.png`);
  const rowsNow = await page.evaluate(() => {
    const links = [...document.querySelectorAll('a[href*="/issue/"]')].filter(
      (a) => a.getBoundingClientRect().width > 0,
    );
    return {
      count: links.length,
      sample: links
        .slice(0, 10)
        .map((a) => ({ t: a.textContent?.trim().slice(0, 90), href: a.getAttribute('href') })),
    };
  });
  dump('snoozedRows', rowsNow);
  say('rows after snoozed ON: ' + rowsNow.count);

  if (rowsNow.count > 0) {
    // dump the first row's full control anatomy
    const rowDump = await page.evaluate(() => {
      const a = [...document.querySelectorAll('a[href*="/issue/"]')].find(
        (x) => x.getBoundingClientRect().width > 0,
      );
      if (!a) return null;
      let row = a;
      for (let i = 0; i < 8 && row.parentElement; i++) {
        row = row.parentElement;
      }
      const walk = (el, d) => {
        if (d > 7) return null;
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return null;
        return {
          tag: el.tagName.toLowerCase(),
          role: el.getAttribute('role'),
          aria: el.getAttribute('aria-label'),
          title: el.getAttribute('title'),
          text: [...el.childNodes]
            .filter((n) => n.nodeType === 3)
            .map((n) => n.textContent.trim())
            .filter(Boolean)
            .join(' ')
            .slice(0, 60),
          rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
          kids: [...el.children].map((c) => walk(c, d + 1)).filter(Boolean),
        };
      };
      return walk(row, 0);
    });
    dump('snoozedRowDom', rowDump);
    // hover it for hover controls
    const rr = rowDump
      ? { x: rowDump.rect[0] + 200, y: rowDump.rect[1] + rowDump.rect[3] / 2 }
      : null;
    if (rr) {
      await page.mouse.move(rr.x, rr.y);
      await page.waitForTimeout(1400);
      await shot(page, `${DIR}/shots/linear-10-snoozed-row-hover.png`);
      const hover = await page.evaluate((rowY) => {
        const out = [];
        for (const el of document.querySelectorAll('button, [role="button"], [role="checkbox"]')) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || Math.abs(r.y + r.height / 2 - rowY) > 26) continue;
          out.push({
            aria: el.getAttribute('aria-label'),
            title: el.getAttribute('title'),
            text: el.textContent?.trim().slice(0, 40),
            rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
          });
        }
        return out;
      }, rr.y);
      dump('snoozedRowHover', hover);
    }
  }
  // toggle back OFF
  await page.mouse.click(sw.rect[0] + sw.rect[2] / 2, sw.rect[1] + sw.rect[3] / 2);
  await page.waitForTimeout(800);
  say('toggled back off');
}
await page.keyboard.press('Escape');
await page.close();
say('DONE');
process.exit(0);
