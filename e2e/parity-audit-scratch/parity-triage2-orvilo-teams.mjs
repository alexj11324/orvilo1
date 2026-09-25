// Orvilo: discover team ids + audit triage page chrome. READ-ONLY (menus only, no row mutations).
import { connect, shot } from './parity-triage-lib.mjs';
import fs from 'fs';
const DIR =
  '/Users/devin/repos/wt-parity-triage/.agents/runtime-acceptance/parity-2026-09-23/triage';
const R = {};
const dump = (k, v) => {
  R[k] = v;
  fs.writeFileSync(`${DIR}/orvilo-enum.json`, JSON.stringify(R, null, 1));
};
const say = (m) => console.log(m);

const browser = await connect();
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
await page.setViewportSize({ width: 1440, height: 900 });

// 1. teams directory -> find team ids
await page.goto('http://localhost:3010/agent-testing/teams', {
  waitUntil: 'domcontentloaded',
  timeout: 45000,
});
for (let i = 0; i < 12; i++) {
  await page.waitForTimeout(2000);
  const s = await page.evaluate(() => document.body?.innerText?.length || 0).catch(() => 0);
  if (s > 300) break;
}
if (page.url().includes('/signin')) {
  say('SIGNIN REDIRECT — need login');
  await page.close();
  process.exit(2);
}
const teamLinks = await page.evaluate(() => {
  const out = new Set();
  for (const a of document.querySelectorAll('a[href*="/teams/"]')) {
    const h = a.getAttribute('href');
    if (h && /team_/.test(h)) out.add(h + ' | ' + a.textContent.trim().slice(0, 60));
  }
  // also sidebar
  return [...out];
});
say('TEAM LINKS: ' + JSON.stringify(teamLinks));
dump('teamLinks', teamLinks);
await shot(page, `${DIR}/shots/orvilo-00-teams.png`);

// pick the first team (PARITY) — prefer ones the task named
const pick = teamLinks.find((l) => /PARITY/i.test(l)) || teamLinks[0];
const teamId = pick?.match(/team_[A-Za-z0-9]+/)?.[0];
say('USING TEAM: ' + teamId);
dump('teamId', teamId);
if (!teamId) {
  await page.close();
  process.exit(3);
}

await page.goto(`http://localhost:3010/agent-testing/teams/${teamId}?tab=triage`, {
  waitUntil: 'domcontentloaded',
  timeout: 45000,
});
for (let i = 0; i < 15; i++) {
  await page.waitForTimeout(2000);
  const s = await page
    .evaluate(() => ({
      len: (document.body?.innerText || '').length,
      skel: !!document.querySelector('[class*="skeleton" i], [class*="Skeleton"]'),
    }))
    .catch(() => ({ err: true }));
  if (s.len > 200 && !s.skel) break;
}
say('URL ' + page.url());
await shot(page, `${DIR}/shots/orvilo-01-full.png`);

// 2. page header controls
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

// 3. full flat dump of main pane (controls + rows)
const flat = await page.evaluate(() => {
  const out = [];
  const seen = new Set();
  const main = document.querySelector('main') || document.body;
  for (const el of main.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0 || r.top > 900) continue;
    const tag = el.tagName.toLowerCase();
    const role = el.getAttribute('role');
    const aria = el.getAttribute('aria-label');
    const title = el.getAttribute('title');
    const disabled = el.disabled === true || el.getAttribute('aria-disabled') === 'true';
    const ownText = [...el.childNodes]
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent.trim())
      .filter(Boolean)
      .join(' ')
      .slice(0, 70);
    const interesting =
      ownText || role || aria || title || ['button', 'a', 'input', 'select'].includes(tag);
    if (!interesting) continue;
    const key = `${tag}|${role}|${aria}|${ownText}|${Math.round(r.x)}|${Math.round(r.y)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      tag,
      role,
      aria,
      title,
      disabled,
      text: ownText,
      x: Math.round(r.x),
      y: Math.round(r.y),
      w: Math.round(r.width),
      h: Math.round(r.height),
    });
  }
  return out;
});
dump('flat', flat);
say('flat elements: ' + flat.length);

// 4. hover first row
const rowInfo = await page.evaluate(() => {
  // find a row: an <a> pointing to a task detail
  const a = [...document.querySelectorAll('a[href*="/task/"]')].find(
    (x) => x.getBoundingClientRect().y > 60,
  );
  if (!a) return null;
  const r = a.getBoundingClientRect();
  return {
    rect: [r.x, r.y, r.width, r.height],
    href: a.getAttribute('href'),
    text: a.textContent.slice(0, 80),
  };
});
dump('firstRow', rowInfo);
if (rowInfo) {
  await page.mouse.move(rowInfo.rect[0] + 300, rowInfo.rect[1] + rowInfo.rect[3] / 2);
  await page.waitForTimeout(1200);
  await shot(page, `${DIR}/shots/orvilo-02-row-hover.png`);
}

// 5. open row "..." menu (title attr = more actions)
const morePos = await page.evaluate(() => {
  const els = [...document.querySelectorAll('button, [role="button"]')].filter((e) => {
    const r = e.getBoundingClientRect();
    return (
      r.width > 0 &&
      r.top > 60 &&
      /more|action|⋯|\.\.\./i.test(
        (e.getAttribute('aria-label') || '') + (e.getAttribute('title') || '') + e.textContent,
      )
    );
  });
  if (!els.length) return null;
  const r = els[0].getBoundingClientRect();
  return [
    r.x + r.width / 2,
    r.y + r.height / 2,
    els[0].getAttribute('title') || els[0].getAttribute('aria-label'),
  ];
});
say('morePos: ' + JSON.stringify(morePos));
if (morePos) {
  await page.mouse.click(morePos[0], morePos[1]);
  await page.waitForTimeout(1200);
  await shot(page, `${DIR}/shots/orvilo-03-row-menu.png`);
  const menu = await page.evaluate(() => {
    const out = [];
    for (const c of document.querySelectorAll(
      '[role="menu"], [role="listbox"], [class*="popover" i], [class*="dropdown" i], [data-state="open"], .ant-dropdown, .ant-popover',
    )) {
      const r = c.getBoundingClientRect();
      if (r.width < 80 || r.height < 30) continue;
      const rows = [];
      for (const el of c.querySelectorAll('[role="menuitem"], li, button, [class*="item"]')) {
        const er = el.getBoundingClientRect();
        if (er.width === 0) continue;
        rows.push({
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
}

// 6. sidebar subnav check (team sub-items)
const subnav = await page.evaluate(() => {
  const nav = document.querySelector('nav, [class*="sidebar" i]') || document.body;
  return [...nav.querySelectorAll('a')]
    .map((a) => ({ href: a.getAttribute('href'), text: a.textContent.trim().slice(0, 40) }))
    .filter((x) => x.text && x.href)
    .slice(0, 60);
});
dump('subnav', subnav);

await page.close();
say('DONE');
process.exit(0);
