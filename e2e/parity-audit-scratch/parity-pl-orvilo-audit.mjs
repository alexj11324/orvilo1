/* Orvilo projects list — full audit with auto-login. args: baseUrl prefix */
import fs from 'node:fs';
import { connectCDP, ensureOrviloAuth } from './parity-pl-lib.mjs';

const OUT = '/tmp/parity-audit-2026-09-23/projects-list';
fs.mkdirSync(OUT, { recursive: true });
const base = process.argv[2] || 'http://localhost:3010';
const prefix = process.argv[3] || 'orvilo';

const browser = await connectCDP();
if (!browser) {
  console.log('CONNECT FAILED');
  process.exit(1);
}
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
await page.setViewportSize({ width: 1440, height: 900 });
const ok = await ensureOrviloAuth(page, `${base}/agent-testing/projects`);
if (!ok) {
  console.log('AUTH FAILED');
  await page.close();
  await browser.close();
  process.exit(1);
}
console.log('URL:', page.url());
await page.screenshot({ path: `${OUT}/${prefix}-projects.png` });

const dumpControls = () =>
  page.evaluate(() => {
    const controls = [];
    for (const el of document.querySelectorAll(
      'button, a[href], input, [role="button"], [role="combobox"], [role="tab"], [role="switch"], [role="checkbox"], [role="menuitem"], [role="option"], [role="columnheader"]',
    )) {
      const r = el.getBoundingClientRect();
      if (r.width === 0) continue;
      controls.push({
        tag: el.tagName.toLowerCase(),
        role: el.getAttribute('role'),
        label:
          el.getAttribute('aria-label') ||
          el.getAttribute('title') ||
          (el.innerText || el.value || el.placeholder || '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 80),
        x: Math.round(r.x),
        y: Math.round(r.y),
        w: Math.round(r.width),
        h: Math.round(r.height),
        href: el.getAttribute('href') || undefined,
        disabled: el.disabled || el.getAttribute('aria-disabled') || undefined,
        pressed: el.getAttribute('aria-pressed') || undefined,
      });
    }
    return controls;
  });

const controls = await dumpControls();
fs.writeFileSync(`${OUT}/${prefix}-controls.json`, JSON.stringify(controls, null, 2));
console.log('== CONTENT-AREA CONTROLS (x>240, y<700) ==');
for (const c of controls.filter((c) => c.x > 240 && c.y < 700)) {
  console.log(
    `${String(c.y).padStart(4)},${String(c.x).padStart(4)} ${c.tag}[${c.role || ''}] "${c.label}" ${c.w}x${c.h}${c.disabled ? ' DISABLED' : ''}${c.href ? ' ->' + c.href : ''}`,
  );
}

const clickByAria = async (re) => {
  const box = await page.evaluate((reSrc) => {
    const rx = new RegExp(reSrc, 'i');
    const els = [...document.querySelectorAll('button, [role="button"]')];
    const el = els.find((e) => {
      const lbl = e.getAttribute('aria-label') || e.getAttribute('title') || '';
      return rx.test(lbl);
    });
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, re.source);
  if (!box) return false;
  await page.mouse.click(box.x, box.y);
  return true;
};

const dumpOverlay = async (tag) => {
  await page.waitForTimeout(1600);
  await page.screenshot({ path: `${OUT}/${prefix}-${tag}.png` });
  const txt = await page.evaluate(() => {
    const cands = [
      ...document.querySelectorAll(
        'body > div, [role="menu"], [role="dialog"], [role="listbox"], [class*="popover" i], [class*="Popup" i]',
      ),
    ]
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.width > 60 && r.height > 40 && r.y < 950)
      .sort((a, b) => b.r.y + b.r.x - (a.r.y + a.r.x));
    return cands
      .slice(0, 4)
      .map(({ el }) => el.innerText)
      .join('\n----\n');
  });
  fs.writeFileSync(`${OUT}/${prefix}-${tag}.txt`, txt);
  console.log(`\n=== ${tag} ===\n` + txt.replace(/\n+/g, ' | ').slice(0, 1800));
};

if (await clickByAria(/display options|list options/i)) await dumpOverlay('display-options');
else console.log('display options NOT FOUND');
await page.keyboard.press('Escape');
await page.waitForTimeout(700);

if (await clickByAria(/add filter|filter/i)) await dumpOverlay('filter-menu');
else console.log('filter NOT FOUND');
await page.keyboard.press('Escape');
await page.waitForTimeout(700);

// context menu on first project row (right-click)
const rowBox = await page.evaluate(() => {
  const link = [...document.querySelectorAll('a')].find((a) => {
    const r = a.getBoundingClientRect();
    return r.width > 600 && r.y > 120 && r.y < 500;
  });
  const r = link?.getBoundingClientRect();
  return r ? { x: r.x + 400, y: r.y + r.height / 2 } : null;
});
if (rowBox) {
  await page.mouse.click(rowBox.x, rowBox.y, { button: 'right' });
  await dumpOverlay('context-menu');
  await page.keyboard.press('Escape');
}

await page.close();
await browser.close();
console.log('DONE');
