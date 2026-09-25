import { connect, shot } from './parity-triage-lib.mjs';
const browser = await connect();
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto('https://linear.app/bdiverifier/team/ORV/triage', {
  waitUntil: 'domcontentloaded',
  timeout: 45000,
});
await page.waitForTimeout(6000);

// 1. Check favorites star state (did I toggle it?)
const fav = await page.evaluate(() => {
  const btn = document.querySelector(
    'button[aria-label*="favorite" i], [role="switch"][aria-label*="favorite" i]',
  );
  if (!btn) return null;
  return {
    aria: btn.getAttribute('aria-label'),
    checked: btn.getAttribute('aria-checked'),
    pressed: btn.getAttribute('aria-pressed'),
    cls: (btn.className || '').slice(0, 80),
  };
});
console.log('FAVORITES STATE:', JSON.stringify(fav));

// Also check sidebar for a new Favorites entry
const sidebarFav = await page.evaluate(() => {
  const nav = document.querySelector('nav') || document.body;
  const links = [...nav.querySelectorAll('a')]
    .map((a) => a.textContent.trim())
    .filter((t) => /triage/i.test(t));
  return links;
});
console.log('SIDEBAR TRIAGE LINKS:', JSON.stringify(sidebarFav));

// 2. Open Help (?) then click "Keyboard shortcuts"
await page.mouse.click(440, 300);
await page.waitForTimeout(300);
await page.keyboard.press('?');
await page.waitForTimeout(1500);
const ks = await page.evaluate(() => {
  const els = [...document.querySelectorAll('*')].filter(
    (e) => e.getBoundingClientRect().width > 0 && e.textContent?.trim() === 'Keyboard shortcuts',
  );
  if (!els.length) return null;
  const el = els[els.length - 1];
  const r = el.getBoundingClientRect();
  return { rect: [r.x, r.y, r.width, r.height] };
});
console.log('KS MENU ITEM:', JSON.stringify(ks));
if (ks) {
  await page.mouse.click(ks.rect[0] + ks.rect[2] / 2, ks.rect[1] + ks.rect[3] / 2);
  await page.waitForTimeout(1800);
  await shot(page, '/tmp/parity-audit-2026-09-23/triage/linear-kbdialog.png');
  const dump = await page.evaluate(() => {
    // find the largest dialog-ish overlay
    const cands = [
      ...document.querySelectorAll(
        'body > div, body * [role="dialog"], [class*="modal" i], [data-state="open"]',
      ),
    ];
    let best = null;
    for (const d of cands) {
      const r = d.getBoundingClientRect();
      if (r.width > 400 && r.height > 300 && (!best || r.width * r.height > best.area))
        best = { el: d, area: r.width * r.height, rect: r };
    }
    if (!best) return null;
    // extract rows: label text + kbd keys
    const rows = [];
    const seen = new Set();
    best.el.querySelectorAll('kbd').forEach(() => {});
    const walk = (el) => {
      const kids = [...el.children];
      const kbs = kids.filter((k) => k.tagName === 'KBD' || k.querySelector?.('kbd'));
      const ownText = [...el.childNodes]
        .filter((n) => n.nodeType === 3)
        .map((n) => n.textContent.trim())
        .filter(Boolean)
        .join(' ');
      if (kbs.length && ownText) {
        const keys = [...el.querySelectorAll('kbd')].map((k) => k.textContent.trim()).join(' ');
        const key2 = ownText + '::' + keys;
        if (!seen.has(key2)) {
          seen.add(key2);
          rows.push({ text: ownText.slice(0, 70), keys });
        }
        return;
      }
      for (const c of kids) walk(c);
    };
    walk(best.el);
    return {
      rect: [
        Math.round(best.rect.x),
        Math.round(best.rect.y),
        Math.round(best.rect.width),
        Math.round(best.rect.height),
      ],
      head: best.el.innerText.slice(0, 200),
      rows,
    };
  });
  console.log('=== KBD DIALOG ===');
  console.log(JSON.stringify(dump));
}
await page.keyboard.press('Escape');
await page.close();
process.exit(0);
