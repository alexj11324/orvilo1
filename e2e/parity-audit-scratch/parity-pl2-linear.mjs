/* Linear projects list — comprehensive audit (round 2).
   Reuses predecessor patterns. One tab, reused via goto. */
import { chromium } from 'playwright';
import fs from 'node:fs';

const OUT =
  '/Users/devin/repos/wt-parity-projects-list/.agents/runtime-acceptance/parity-2026-09-23/projects-list';
fs.mkdirSync(OUT, { recursive: true });

let browser;
for (let i = 0; i < 8; i++) {
  try {
    browser = await chromium.connectOverCDP('http://localhost:9222', { timeout: 120000 });
    break;
  } catch (e) {
    console.log(`connect retry ${i}: ${e.message.split('\n')[0]}`);
    await new Promise((r) => setTimeout(r, 5000));
  }
}
if (!browser) {
  console.log('CONNECT FAILED');
  process.exit(1);
}
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
await page.setViewportSize({ width: 1440, height: 900 });
try {
  await page.goto('https://linear.app/bdiverifier/projects/all', {
    waitUntil: 'commit',
    timeout: 30000,
  });
} catch {}
await page.bringToFront().catch(() => {});
await page.waitForTimeout(9000);
console.log('URL:', page.url(), 'TITLE:', await page.title());
await page.screenshot({ path: `${OUT}/linear-01-page.png` });

// ---------- full controls inventory ----------
const dumpControls = () =>
  page.evaluate(() => {
    const controls = [];
    for (const el of document.querySelectorAll(
      'button, a[href], input, [role="button"], [role="combobox"], [role="tab"], [role="switch"], [role="checkbox"], [role="menuitem"], [role="option"], [role="columnheader"], [role="radio"]',
    )) {
      const r = el.getBoundingClientRect();
      if (r.width === 0) continue;
      const svg = el.querySelector('svg');
      controls.push({
        tag: el.tagName.toLowerCase(),
        role: el.getAttribute('role'),
        label:
          el.getAttribute('aria-label') ||
          el.getAttribute('title') ||
          (el.innerText || el.value || el.placeholder || '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 90),
        x: Math.round(r.x),
        y: Math.round(r.y),
        w: Math.round(r.width),
        h: Math.round(r.height),
        href: el.getAttribute('href') || undefined,
        disabled: el.disabled || el.getAttribute('aria-disabled') || undefined,
        pressed: el.getAttribute('aria-pressed') || el.getAttribute('aria-selected') || undefined,
        svg: svg ? (svg.getAttribute('class') || '').slice(0, 60) : undefined,
      });
    }
    return controls;
  });

const controls = await dumpControls();
fs.writeFileSync(`${OUT}/linear-controls.json`, JSON.stringify(controls, null, 2));
console.log('== CONTENT-AREA CONTROLS (x>240, y<200) ==');
for (const c of controls.filter((c) => c.x > 240 && c.y < 200)) {
  console.log(
    `${String(c.y).padStart(4)},${String(c.x).padStart(4)} ${c.tag}[${c.role || ''}] "${c.label}" ${c.w}x${c.h}${c.disabled ? ' DISABLED' : ''}${c.href ? ' ->' + c.href : ''}${c.pressed ? ' pressed=' + c.pressed : ''}`,
  );
}
console.log('== ROW-AREA CONTROLS (y 200-500) ==');
for (const c of controls.filter((c) => c.x > 240 && c.y >= 200 && c.y < 500)) {
  console.log(
    `${String(c.y).padStart(4)},${String(c.x).padStart(4)} ${c.tag}[${c.role || ''}] "${c.label}" ${c.w}x${c.h}${c.href ? ' ->' + c.href : ''}`,
  );
}

// ---------- first row anatomy ----------
const rowAnatomy = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('a')].filter((a) => {
    const r = a.getBoundingClientRect();
    return r.width > 700 && r.height >= 30 && r.height <= 70 && r.y > 100 && r.y < 700;
  });
  const row = rows[0];
  if (!row) return { found: false, count: rows.length };
  const items = [];
  row.querySelectorAll('*').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0) return;
    const txt = (el.innerText || '').replace(/\s+/g, ' ').trim();
    if (el.children.length === 0 || el.tagName === 'svg' || el.tagName === 'SVG') {
      items.push({
        tag: el.tagName.toLowerCase(),
        role: el.getAttribute('role'),
        aria: el.getAttribute('aria-label'),
        cls: (el.className?.baseVal ?? el.className ?? '').toString().slice(0, 60),
        txt: txt.slice(0, 40),
        x: Math.round(r.x),
        w: Math.round(r.width),
        h: Math.round(r.height),
      });
    }
  });
  return { found: true, count: rows.length, href: row.getAttribute('href'), items };
});
fs.writeFileSync(`${OUT}/linear-row-anatomy.json`, JSON.stringify(rowAnatomy, null, 2));
console.log('== ROW ANATOMY ==', rowAnatomy.count, 'rows; first href:', rowAnatomy.href);
for (const i of (rowAnatomy.items || []).slice(0, 40)) {
  console.log(
    `  x=${String(i.x).padStart(4)} ${i.tag}[${i.role || ''}] "${i.txt || i.aria || ''}" ${i.w}x${i.h} ${i.cls}`,
  );
}

// ---------- hover first row ----------
const rowBox = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('a')].filter((a) => {
    const r = a.getBoundingClientRect();
    return r.width > 700 && r.height >= 30 && r.height <= 70 && r.y > 100 && r.y < 700;
  });
  const r = rows[0]?.getBoundingClientRect();
  return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
});
if (rowBox) {
  await page.mouse.move(rowBox.x, rowBox.y);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/linear-02-row-hover.png` });
  const hoverControls = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('button, [role="button"]')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.y < 100 || r.y > 700) continue;
      const style = getComputedStyle(el);
      if (parseFloat(style.opacity) < 0.9 && style.visibility !== 'visible') continue;
      out.push({
        label: el.getAttribute('aria-label') || (el.innerText || '').trim().slice(0, 50),
        x: Math.round(r.x),
        y: Math.round(r.y),
        opacity: style.opacity,
      });
    }
    return out;
  });
  console.log('== HOVER VISIBLE BUTTONS ==');
  for (const c of hoverControls) console.log(`  ${c.y},${c.x} "${c.label}" op=${c.opacity}`);
}

// ---------- column headers ----------
const headers = await page.evaluate(() => {
  const hs = [];
  for (const el of document.querySelectorAll('[role="columnheader"], thead th, thead td')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0) continue;
    hs.push({
      label: (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 40),
      x: Math.round(r.x),
      w: Math.round(r.width),
    });
  }
  return hs;
});
console.log('== COLUMN HEADERS ==', JSON.stringify(headers));

await page.close();
await browser.close();
console.log('DONE');
