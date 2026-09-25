/* Linear projects list — deep interactive audit: toolbar, menus, row anatomy. */
import { chromium } from 'playwright';
import fs from 'node:fs';

const OUT = '/tmp/parity-audit-2026-09-23/projects-list';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto('https://linear.app/bdiverifier/projects/all', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(6000);

// 1. Enumerate every button/menuitem-ish element with aria-label or text in the header/toolbar zone
const controls = await page.evaluate(() => {
  const out = [];
  const els = document.querySelectorAll(
    'button, [role="button"], [role="tab"], [role="combobox"], a[href], input',
  );
  for (const el of els) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const label =
      el.getAttribute('aria-label') ||
      el.getAttribute('title') ||
      (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 60);
    out.push({
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute('role'),
      label,
      x: Math.round(r.x),
      y: Math.round(r.y),
      w: Math.round(r.width),
      h: Math.round(r.height),
      cls: (el.className?.toString() || '').slice(0, 50),
      href: el.getAttribute('href') || undefined,
      disabled: el.disabled || el.getAttribute('aria-disabled') || undefined,
    });
  }
  return out;
});
fs.writeFileSync(`${OUT}/linear-controls.json`, JSON.stringify(controls, null, 2));
console.log(
  controls
    .filter((c) => c.y < 300)
    .map(
      (c) => `${c.y},${c.x} ${c.tag}[${c.role || ''}] "${c.label}" ${c.disabled ? 'DISABLED' : ''}`,
    )
    .join('\n'),
);
await page.close();
await browser.close();
