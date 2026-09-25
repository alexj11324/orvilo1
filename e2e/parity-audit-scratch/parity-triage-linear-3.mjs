import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto('https://linear.app/bdiverifier/team/ORV/triage', {
  waitUntil: 'domcontentloaded',
});
await page.waitForTimeout(6000);

// Enumerate ALL elements in the list-pane header strip (y < 60, x in 245..645)
const headDump = await page.evaluate(() => {
  const out = [];
  const all = document.querySelectorAll('body *');
  for (const el of all) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.top > 60 || r.bottom < 8) continue;
    if (r.left < 240 || r.left > 650) continue;
    const tag = el.tagName.toLowerCase();
    if (
      el.children.length > 0 &&
      tag !== 'button' &&
      tag !== 'a' &&
      el.getAttribute('role') !== 'button'
    ) {
      // keep containers only if they carry aria/role/title
      if (!el.getAttribute('aria-label') && !el.getAttribute('role') && !el.getAttribute('title'))
        continue;
    }
    out.push({
      tag,
      role: el.getAttribute('role'),
      aria: el.getAttribute('aria-label'),
      title: el.getAttribute('title'),
      id: el.id || undefined,
      text:
        el.childNodes.length === 1 && el.childNodes[0].nodeType === 3
          ? el.textContent.trim().slice(0, 50)
          : el.textContent?.trim().slice(0, 40) || '',
      rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
      cls: typeof el.className === 'string' ? el.className.slice(0, 60) : '',
      cursor: getComputedStyle(el).cursor,
    });
  }
  return out;
});
console.log('=== HEADER-REGION ELEMENTS ===');
console.log(JSON.stringify(headDump, null, 1));
await page.screenshot({
  path: '/tmp/parity-audit-2026-09-23/triage/linear-triage-header.png',
  clip: { x: 240, y: 0, width: 410, height: 70 },
});
await page.close();
process.exit(0);
