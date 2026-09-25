import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto('https://linear.app/bdiverifier/team/ORV/triage', {
  waitUntil: 'domcontentloaded',
});
await page.waitForTimeout(6000);

const shot = (p) =>
  page.screenshot({ path: p, timeout: 6000 }).catch(() => console.log('shot skip', p));

// Click neutral area of list pane to ensure page focus, then press ?
await page.mouse.click(440, 300);
await page.waitForTimeout(400);
await page.keyboard.press('?');
await page.waitForTimeout(1800);
await shot('/tmp/parity-audit-2026-09-23/triage/linear-shortcuts.png');

const kbd = await page.evaluate(() => {
  const dialogs = [
    ...document.querySelectorAll(
      '[role="dialog"], [role="alertdialog"], [class*="modal"], [class*="Modal"], [data-state="open"]',
    ),
  ];
  const results = [];
  for (const d of dialogs) {
    const r = d.getBoundingClientRect();
    if (r.width < 200) continue;
    const rows = [];
    const walk = (el, depth) => {
      if (depth > 9) return;
      const er = el.getBoundingClientRect();
      if (er.width === 0) return;
      const tag = el.tagName.toLowerCase();
      if (tag === 'kbd') {
        rows.push({ kbd: el.textContent.trim() });
        return;
      }
      const ownText = [...el.childNodes]
        .filter((n) => n.nodeType === 3)
        .map((n) => n.textContent.trim())
        .filter(Boolean)
        .join(' ');
      const hasKbd = !!el.querySelector?.('kbd');
      if (ownText || (hasKbd && el.children.length <= 6)) {
        rows.push({
          text: (ownText || el.textContent.trim()).slice(0, 80),
          keys: [...el.querySelectorAll('kbd')].map((k) => k.textContent.trim()).join(' '),
          depth,
        });
        if (hasKbd) return; // don't descend further
      }
      for (const c of el.children) walk(c, depth + 1);
    };
    walk(d, 0);
    results.push({
      rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
      rows: rows.slice(0, 200),
    });
  }
  return results;
});
console.log('=== SHORTCUT DIALOG ===');
console.log(JSON.stringify(kbd, null, 1));
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
await page.close();
process.exit(0);
