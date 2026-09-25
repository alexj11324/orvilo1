/* Linear projects — open Display options, Add filter, row-cell buttons; dump contents. */
import { chromium } from 'playwright';
import fs from 'node:fs';

const OUT = '/tmp/parity-audit-2026-09-23/projects-list';
fs.mkdirSync(OUT, { recursive: true });
let browser;
for (let i = 0; i < 6; i++) {
  try {
    browser = await chromium.connectOverCDP('http://localhost:9222', { timeout: 20000 });
    break;
  } catch (e) {
    console.log(`connect retry ${i}`);
    await new Promise((r) => setTimeout(r, 4000));
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
    timeout: 25000,
  });
} catch {}
await page.bringToFront().catch(() => {});
await page.waitForTimeout(8000);
console.log('URL:', page.url());

const clickByLabel = async (re) => {
  const box = await page.evaluate((reSrc) => {
    const rx = new RegExp(reSrc, 'i');
    const els = [...document.querySelectorAll('button, [role="button"], a')];
    const el = els.find((e) => {
      const lbl = e.getAttribute('aria-label') || e.getAttribute('title') || e.innerText || '';
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
  await page.screenshot({ path: `${OUT}/linear-${tag}.png` });
  const txt = await page.evaluate(() => {
    // Linear menus live in a portal layer — grab all overlay-ish containers
    const cands = [
      ...document.querySelectorAll(
        'body > div, [role="menu"], [role="dialog"], [role="listbox"], [data-radix-popper-content-wrapper], [class*="popover" i], [class*="menu" i]',
      ),
    ]
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.width > 60 && r.height > 40 && r.y < 900)
      .sort((a, b) => b.r.y - a.r.y);
    const top = cands
      .slice(0, 4)
      .map(({ el }) => el.innerText)
      .join('\n----\n');
    return top;
  });
  fs.writeFileSync(`${OUT}/linear-${tag}.txt`, txt);
  console.log(`\n=== ${tag} ===\n` + txt.replace(/\n+/g, ' | ').slice(0, 2000));
};

// 1. Display options
if (await clickByLabel(/display options/i)) await dumpOverlay('display-options');
else console.log('display options button NOT FOUND');
await page.keyboard.press('Escape');
await page.waitForTimeout(700);

// 2. Add filter
if (await clickByLabel(/add filter/i)) await dumpOverlay('add-filter');
else console.log('add filter button NOT FOUND');
await page.keyboard.press('Escape');
await page.waitForTimeout(700);

// 3. Open sidebar (aggregate panel)
if (await clickByLabel(/open sidebar|close sidebar/i)) await dumpOverlay('sidebar');
await page.waitForTimeout(500);

// 4. "Add new view" + button — DO NOT create anything; open then Esc
if (await clickByLabel(/add new view/i)) await dumpOverlay('add-new-view');
await page.keyboard.press('Escape');
await page.waitForTimeout(700);

// 5. "New project" button — open then Esc (must NOT submit)
if (await clickByLabel(/^new project$/i)) await dumpOverlay('new-project-modal');
await page.keyboard.press('Escape');
await page.waitForTimeout(700);

// 6. Row cell interactions on FIRST row: priority button, target date, issues count, status %
const cellProbe = async (x, tag) => {
  // find first row's button near x
  const box = await page.evaluate((xTarget) => {
    const rows = [...document.querySelectorAll('a')].filter((a) => {
      const r = a.getBoundingClientRect();
      return r.width > 800 && r.height >= 40 && r.height <= 60 && r.y > 100;
    });
    const row = rows[0];
    if (!row) return null;
    const rowTop = row.getBoundingClientRect().y;
    const btns = [...row.querySelectorAll('button, [role="button"]')];
    const b = btns.find((b) => {
      const r = b.getBoundingClientRect();
      return Math.abs(r.x + r.width / 2 - xTarget) < 40;
    });
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, x);
  if (!box) {
    console.log(`cellProbe ${tag}: no button near x=${x}`);
    return;
  }
  await page.mouse.click(box.x, box.y);
  await dumpOverlay(`cell-${tag}`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
};

await cellProbe(1030, 'priority'); // priority icon ~x=1017
await cellProbe(1180, 'targetdate'); // ~x=1145
await cellProbe(1275, 'issues'); // ~x=1263
await cellProbe(1330, 'status'); // ~x=1297
// right-click first row for context menu
const rowBox = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('a')].filter((a) => {
    const r = a.getBoundingClientRect();
    return r.width > 800 && r.height >= 40 && r.height <= 60 && r.y > 100;
  });
  const r = rows[0]?.getBoundingClientRect();
  return r ? { x: r.x + 500, y: r.y + r.height / 2 } : null;
});
if (rowBox) {
  await page.mouse.click(rowBox.x, rowBox.y, { button: 'right' });
  await dumpOverlay('context-menu');
  await page.keyboard.press('Escape');
}

await page.close();
await browser.close();
console.log('DONE');
