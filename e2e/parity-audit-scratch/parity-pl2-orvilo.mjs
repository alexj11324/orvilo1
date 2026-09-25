/* Orvilo projects list — audit. args: baseUrl prefix */
import { chromium } from 'playwright';
import fs from 'node:fs';

const OUT =
  '/Users/devin/repos/wt-parity-projects-list/.agents/runtime-acceptance/parity-2026-09-23/projects-list';
fs.mkdirSync(OUT, { recursive: true });
const base = process.argv[2] || 'http://localhost:3010';
const prefix = process.argv[3] || 'orvilo';
const log = (...a) => {
  console.log(...a);
  fs.appendFileSync(`${OUT}/${prefix}-audit.log`, a.join(' ') + '\n');
};

let browser;
for (let i = 0; i < 8; i++) {
  try {
    browser = await chromium.connectOverCDP('http://localhost:9222', { timeout: 120000 });
    break;
  } catch (e) {
    log(`connect retry ${i}: ${e.message.split('\n')[0]}`);
    await new Promise((r) => setTimeout(r, 5000));
  }
}
if (!browser) process.exit(1);
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
await page.setViewportSize({ width: 1440, height: 900 });
try {
  await page.goto(`${base}/agent-testing/projects`, { waitUntil: 'commit', timeout: 25000 });
} catch {}
await page.bringToFront().catch(() => {});
await page.waitForTimeout(9000);
log('URL:', page.url());
if (page.url().includes('/signin')) {
  log('BOUNCED TO SIGNIN');
  await page.screenshot({ path: `${OUT}/${prefix}-signin.png` });
  await page.close();
  await browser.close();
  process.exit(2);
}
await page.screenshot({ path: `${OUT}/${prefix}-01-page.png` });

const dumpControls = () =>
  page.evaluate(() => {
    const controls = [];
    for (const el of document.querySelectorAll(
      'button, a[href], input, [role="button"], [role="combobox"], [role="tab"], [role="switch"], [role="checkbox"], [role="menuitem"], [role="option"], [role="radio"]',
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
            .slice(0, 90),
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
log('== CONTENT CONTROLS (x>200, y<200) ==');
for (const c of controls.filter((c) => c.x > 200 && c.y < 200)) {
  log(
    `${String(c.y).padStart(4)},${String(c.x).padStart(4)} ${c.tag}[${c.role || ''}] "${c.label}" ${c.w}x${c.h}${c.disabled ? ' DISABLED' : ''}${c.href ? ' ->' + c.href : ''}`,
  );
}
log('== ROW CONTROLS (y 200-600) ==');
for (const c of controls.filter((c) => c.x > 200 && c.y >= 200 && c.y < 600)) {
  log(
    `${String(c.y).padStart(4)},${String(c.x).padStart(4)} ${c.tag}[${c.role || ''}] "${c.label}" ${c.w}x${c.h}${c.href ? ' ->' + c.href : ''}`,
  );
}

// row anatomy
const rowAnatomy = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('a[aria-label]')].filter((a) => {
    const r = a.getBoundingClientRect();
    return r.width > 600 && r.y > 100 && r.y < 700;
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
        txt: txt.slice(0, 40),
        x: Math.round(r.x),
        w: Math.round(r.width),
        h: Math.round(r.height),
      });
    }
  });
  return { found: true, count: rows.length, href: row.getAttribute('href'), items };
});
fs.writeFileSync(`${OUT}/${prefix}-row-anatomy.json`, JSON.stringify(rowAnatomy, null, 2));
log('== ROW ANATOMY ==', rowAnatomy.count, 'rows; href:', rowAnatomy.href);
for (const i of (rowAnatomy.items || []).slice(0, 45)) {
  log(
    `  x=${String(i.x).padStart(4)} ${i.tag}[${i.role || ''}] "${i.txt || i.aria || ''}" ${i.w}x${i.h}`,
  );
}

// hover first row
const rowBox = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('a[aria-label]')].filter((a) => {
    const r = a.getBoundingClientRect();
    return r.width > 600 && r.y > 100 && r.y < 700;
  });
  const r = rows[0]?.getBoundingClientRect();
  return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
});
if (rowBox) {
  await page.mouse.move(rowBox.x, rowBox.y);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/${prefix}-02-row-hover.png` });
  const hc = await dumpControls();
  log('== HOVER-STATE CONTROLS (row band) ==');
  for (const c of hc.filter((c) => Math.abs(c.y - rowBox.y) < 30)) {
    log(`  ${c.y},${c.x} "${c.label}" ${c.w}x${c.h}`);
  }
}

// menus
const clickByLabel = async (re) => {
  const box = await page.evaluate((reSrc) => {
    const rx = new RegExp(reSrc, 'i');
    const el = [...document.querySelectorAll('button, [role="button"], a')].find((e) => {
      const r = e.getBoundingClientRect();
      if (r.width === 0) return false;
      return rx.test(e.getAttribute('aria-label') || e.getAttribute('title') || '');
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
  await page.screenshot({ path: `${OUT}/${prefix}-menu-${tag}.png` });
  const txt = await page.evaluate(() => {
    const pops = [
      ...document.querySelectorAll(
        '[class*="popover" i], [role="dialog"], [role="menu"], [role="listbox"], [class*="Popup" i], [class*="dropdown" i]',
      ),
    ]
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.width > 80 && r.height > 40)
      .sort((a, b) => b.r.width * b.r.height - a.r.width * a.r.height);
    return pops
      .slice(0, 3)
      .map(({ el, r }) => `[${Math.round(r.x)},${Math.round(r.y)}] ` + el.innerText)
      .join('\n----\n');
  });
  fs.writeFileSync(`${OUT}/${prefix}-menu-${tag}.txt`, txt);
  log(`\n=== ${tag} ===\n` + txt.replace(/\n+/g, ' | ').slice(0, 1600));
};

if (await clickByLabel(/display options/i)) await dumpOverlay('display-options');
else log('display options NOT FOUND');
await page.keyboard.press('Escape');
await page.waitForTimeout(700);
if (await clickByLabel(/add filter|filter/i)) await dumpOverlay('add-filter');
else log('add filter NOT FOUND');
await page.keyboard.press('Escape');
await page.waitForTimeout(700);

// right-click first row → context menu
if (rowBox) {
  await page.mouse.click(rowBox.x, rowBox.y, { button: 'right' });
  await dumpOverlay('context-menu');
  await page.keyboard.press('Escape');
}

// lead cell click (avatar) on first row — find button inside row near right side
const leadBox = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('a[aria-label]')].filter((a) => {
    const r = a.getBoundingClientRect();
    return r.width > 600 && r.y > 100 && r.y < 700;
  });
  const row = rows[0];
  if (!row) return null;
  const rowEl = row.parentElement;
  const btns = [...rowEl.querySelectorAll('button')];
  const b = btns.find((b) => /lead|成员|负责/i.test(b.getAttribute('aria-label') || ''));
  if (!b) return null;
  const r = b.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
if (leadBox) {
  await page.mouse.click(leadBox.x, leadBox.y);
  await dumpOverlay('lead-picker');
  await page.keyboard.press('Escape');
} else log('no lead button found');

await page.close();
await browser.close();
log('DONE');
