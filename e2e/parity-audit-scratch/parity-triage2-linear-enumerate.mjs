// Linear triage — full interactive-element enumeration. READ-ONLY: no row mutations.
import { connect, shot } from './parity-triage-lib.mjs';
import fs from 'fs';
const DIR =
  '/Users/devin/repos/wt-parity-triage/.agents/runtime-acceptance/parity-2026-09-23/triage';
const R = {};
const dump = (k, v) => {
  R[k] = v;
  fs.writeFileSync(`${DIR}/linear-enum.json`, JSON.stringify(R, null, 1));
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
// settle loop: wait until row count or empty state is stable-ish
for (let i = 0; i < 15; i++) {
  await page.waitForTimeout(2000);
  const s = await page
    .evaluate(() => ({
      len: (document.body?.innerText || '').length,
      url: location.href,
    }))
    .catch(() => ({ err: true }));
  if (s.len > 400) break;
}
say('URL ' + page.url());
await shot(page, `${DIR}/shots/linear-01-full.png`);

// ---------- 1. page header (team name, tabs, right controls) ----------
const header = await page.evaluate(() => {
  const out = { buttons: [], tabs: [], text: '' };
  const hdr =
    document.querySelector('main header, [role="main"] header') || document.querySelector('header');
  if (hdr) {
    out.text = hdr.innerText.slice(0, 400);
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
  // tab strip: links under main that look like tabs
  for (const a of document.querySelectorAll('main a[href*="/team/ORV"], main [role="tab"]')) {
    const r = a.getBoundingClientRect();
    if (r.width === 0 || r.top > 160) continue;
    out.tabs.push({
      text: a.textContent?.trim().slice(0, 40),
      href: a.getAttribute('href'),
      rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
      current:
        a.getAttribute('aria-current') ||
        a.getAttribute('aria-selected') ||
        a.getAttribute('data-active'),
    });
  }
  return out;
});
dump('header', header);

// ---------- 2. list-pane toolbar (filter / display / create) ----------
const toolbar = await page.evaluate(() => {
  const out = [];
  // everything between y=48 (below tab strip) and y=140 in the main pane
  for (const el of document.querySelectorAll(
    'main button, main [role="button"], main input, main [role="switch"], [role="main"] button, [role="main"] [role="button"]',
  )) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.top > 160 || r.top < 40) continue;
    out.push({
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute('role'),
      aria: el.getAttribute('aria-label'),
      title: el.getAttribute('title'),
      text: el.textContent?.trim().slice(0, 60),
      rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
      svgCount: el.querySelectorAll('svg').length,
      kbd: el.querySelector('kbd')?.textContent,
    });
  }
  return out;
});
dump('toolbar', toolbar);

// ---------- 3. rows ----------
const rows = await page.evaluate(() => {
  const out = [];
  // Linear triage rows: role=row or listitem or links containing issue identifiers
  const cands = [
    ...document.querySelectorAll(
      'main [role="row"], main [role="listitem"], main a[href*="/issue/"]',
    ),
  ];
  const seen = new Set();
  for (const row of cands) {
    const r = row.getBoundingClientRect();
    if (r.width === 0 || r.height < 20) continue;
    const key = `${Math.round(r.y)}-${row.textContent?.slice(0, 30)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const cell = {
      tag: row.tagName.toLowerCase(),
      role: row.getAttribute('role'),
      text: row.textContent?.trim().slice(0, 120),
      rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
      controls: [],
    };
    for (const el of row.querySelectorAll(
      'button, [role="button"], [role="checkbox"], input, a[href], [aria-label]',
    )) {
      const er = el.getBoundingClientRect();
      if (er.width === 0) continue;
      cell.controls.push({
        tag: el.tagName.toLowerCase(),
        role: el.getAttribute('role'),
        aria: el.getAttribute('aria-label'),
        title: el.getAttribute('title'),
        text: el.textContent?.trim().slice(0, 40),
        rect: [Math.round(er.x), Math.round(er.y), Math.round(er.width), Math.round(er.height)],
        svg: el.querySelectorAll('svg').length,
      });
    }
    out.push(cell);
  }
  return out.slice(0, 12);
});
dump('rows', rows);
say('row count: ' + rows.length);

// ---------- 4. hover first row -> reveal hover controls ----------
if (rows.length) {
  const y = rows[0].rect[1] + rows[0].rect[3] / 2;
  const x = rows[0].rect[0] + rows[0].rect[2] / 2;
  await page.mouse.move(x, y);
  await page.waitForTimeout(1400);
  await shot(page, `${DIR}/shots/linear-02-row-hover.png`);
  const hoverCtl = await page.evaluate((rowY) => {
    const out = [];
    for (const el of document.querySelectorAll(
      'button, [role="button"], [role="checkbox"], [role="menu"], [aria-label]',
    )) {
      const r = el.getBoundingClientRect();
      if (r.width === 0) continue;
      if (Math.abs(r.y - rowY) > 44 && r.top < rowY + 50 && r.bottom > rowY - 50) {
        /* keep */
      } else if (r.top < rowY - 40 || r.top > rowY + 60) continue;
      out.push({
        tag: el.tagName.toLowerCase(),
        role: el.getAttribute('role'),
        aria: el.getAttribute('aria-label'),
        title: el.getAttribute('title'),
        text: el.textContent?.trim().slice(0, 50),
        rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
        visible:
          getComputedStyle(el).opacity !== '0' && getComputedStyle(el).visibility !== 'hidden',
      });
    }
    return out;
  }, rows[0].rect[1]);
  dump('rowHoverControls', hoverCtl);
}

// ---------- 5. open Display options ----------
const clickByName = async (re) => {
  const pos = await page.evaluate((src) => {
    const rx = new RegExp(src, 'i');
    const els = [...document.querySelectorAll('button, [role="button"]')].filter((e) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && rx.test(e.getAttribute('aria-label') || e.textContent || '');
    });
    if (!els.length) return null;
    const r = els[0].getBoundingClientRect();
    return [r.x + r.width / 2, r.y + r.height / 2];
  }, re.source);
  if (pos) {
    await page.mouse.click(pos[0], pos[1]);
    await page.waitForTimeout(1200);
  }
  return !!pos;
};

const dumpPopup = () =>
  page.evaluate(() => {
    const out = [];
    const candidates = document.querySelectorAll(
      '[role="menu"], [role="listbox"], [role="dialog"], [data-radix-popper-content-wrapper], [class*="popper" i], [class*="popover" i], [data-state="open"]',
    );
    for (const c of candidates) {
      const r = c.getBoundingClientRect();
      if (r.width < 100 || r.height < 40) continue;
      const rows = [];
      for (const el of c.querySelectorAll(
        '[role="menuitem"], [role="option"], [role="menuitemcheckbox"], [role="menuitemradio"], [role="switch"], [role="radio"], button, input, li, [role="separator"], hr, [class*="label" i]',
      )) {
        const er = el.getBoundingClientRect();
        if (er.width === 0) continue;
        rows.push({
          tag: el.tagName.toLowerCase(),
          role: el.getAttribute('role'),
          type: el.getAttribute('type'),
          checked:
            el.getAttribute('aria-checked') ??
            (typeof el.checked === 'boolean' ? el.checked : null),
          pressed: el.getAttribute('aria-pressed'),
          selected: el.getAttribute('aria-selected'),
          disabled: el.getAttribute('disabled') !== null || el.getAttribute('aria-disabled'),
          text: el.textContent?.trim().slice(0, 70),
          kbd: el.querySelector('kbd')?.textContent,
        });
      }
      out.push({
        rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
        allText: c.textContent.slice(0, 900),
        rows,
      });
    }
    return out;
  });

if (await clickByName(/display options/i)) {
  await shot(page, `${DIR}/shots/linear-03-display-options.png`);
  dump('displayOptions', await dumpPopup());
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
} else say('no Display options button');

// ---------- 6. Add filter ----------
if (await clickByName(/add filter|filter/i)) {
  await shot(page, `${DIR}/shots/linear-04-add-filter.png`);
  dump('addFilter', await dumpPopup());
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
} else say('no Add filter button');

// ---------- 7. row "..." / more menu (hover then find last button in row) ----------
if (rows.length) {
  const y = rows[0].rect[1] + rows[0].rect[3] / 2;
  await page.mouse.move(rows[0].rect[0] + rows[0].rect[2] / 2, y);
  await page.waitForTimeout(900);
  const moreBtn = await page.evaluate((rowY) => {
    const els = [...document.querySelectorAll('button, [role="button"]')].filter((e) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && Math.abs(r.y + r.height / 2 - rowY) < 24;
    });
    // prefer explicit more/ellipsis aria, else rightmost icon button
    const named = els.find((e) =>
      /more|actions|menu|ellipsis/i.test(
        (e.getAttribute('aria-label') || '') +
          (e.getAttribute('title') || '') +
          (e.textContent || ''),
      ),
    );
    const pick =
      named || els.sort((a, b) => b.getBoundingClientRect().x - a.getBoundingClientRect().x)[0];
    if (!pick) return null;
    const r = pick.getBoundingClientRect();
    return {
      x: r.x + r.width / 2,
      y: r.y + r.height / 2,
      aria: pick.getAttribute('aria-label'),
      text: pick.textContent?.trim().slice(0, 30),
    };
  }, y);
  say('moreBtn: ' + JSON.stringify(moreBtn));
  if (moreBtn) {
    await page.mouse.click(moreBtn.x, moreBtn.y);
    await page.waitForTimeout(1200);
    await shot(page, `${DIR}/shots/linear-05-row-menu.png`);
    dump('rowMenu', await dumpPopup());
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  }
}

// ---------- 8. header "..." (page-level more) ----------
const pageMore = await page.evaluate(() => {
  const els = [
    ...document.querySelectorAll('header button, main header button, [role="main"] header button'),
  ].filter((e) => {
    const r = e.getBoundingClientRect();
    return (
      r.width > 0 &&
      r.top < 60 &&
      /more|menu|options/i.test((e.getAttribute('aria-label') || '') + (e.textContent || ''))
    );
  });
  if (!els.length) return null;
  const r = els[els.length - 1].getBoundingClientRect();
  return {
    x: r.x + r.width / 2,
    y: r.y + r.height / 2,
    aria: els[els.length - 1].getAttribute('aria-label'),
  };
});
if (pageMore) {
  await page.mouse.click(pageMore.x, pageMore.y);
  await page.waitForTimeout(1200);
  await shot(page, `${DIR}/shots/linear-06-page-menu.png`);
  dump('pageMenu', await dumpPopup());
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
}

// ---------- 9. empty state / footer hints ----------
const misc = await page.evaluate(() => {
  const t = document.body.innerText;
  return {
    hasEmptyState: /nothing to triage|all caught up|no issues/i.test(t),
    kbdHints: [...document.querySelectorAll('kbd')].map((k) => k.textContent).slice(0, 20),
    bodySnip: t.slice(0, 600),
  };
});
dump('misc', misc);

await page.close();
say('DONE');
process.exit(0);
