/* Orvilo projects list — full audit: page + display options + filter menu + row anatomy.
   args: baseUrl prefix */
import { chromium } from 'playwright';
import fs from 'node:fs';

const OUT = '/tmp/parity-audit-2026-09-23/projects-list';
fs.mkdirSync(OUT, { recursive: true });
const base = process.argv[2] || 'http://localhost:3010';
const prefix = process.argv[3] || 'orvilo';

let browser;
for (let i = 0; i < 4; i++) {
  try {
    browser = await chromium.connectOverCDP('http://localhost:9222', { timeout: 20000 });
    break;
  } catch (e) {
    console.log(`connect retry ${i}: ${e.message.split('\n')[0]}`);
    await new Promise((r) => setTimeout(r, 3000));
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
  await page.goto(`${base}/agent-testing/projects`, { waitUntil: 'commit', timeout: 20000 });
} catch {}
await page.bringToFront().catch(() => {});
await page.waitForTimeout(9000);
console.log('URL:', page.url());
await page.screenshot({ path: `${OUT}/${prefix}-projects.png` });

const dumpControls = () =>
  page.evaluate(() => {
    const controls = [];
    for (const el of document.querySelectorAll(
      'button, a[href], input, [role="button"], [role="combobox"], [role="tab"], [role="switch"], [role="checkbox"], [role="menuitem"], [role="option"]',
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
console.log('== CONTENT-AREA CONTROLS (x>240, y<560) ==');
for (const c of controls.filter((c) => c.x > 240 && c.y < 560)) {
  console.log(
    `${String(c.y).padStart(4)},${String(c.x).padStart(4)} ${c.tag}[${c.role || ''}] "${c.label}" ${c.w}x${c.h}${c.disabled ? ' DISABLED' : ''}${c.href ? ' ->' + c.href : ''}`,
  );
}

// Open Display options popover (settings2 icon button, right side of toolbar)
const dispBtn = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button[aria-label]')];
  const b = btns.find((b) => /display options/i.test(b.getAttribute('aria-label') || ''));
  if (!b) return null;
  const r = b.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
if (dispBtn) {
  await page.mouse.click(dispBtn.x, dispBtn.y);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/${prefix}-display-options.png` });
  const menu = await page.evaluate(() => {
    const pop = [
      ...document.querySelectorAll('[class*="popover"], [role="dialog"], [class*="Popover"]'),
    ]
      .filter((el) => el.getBoundingClientRect().width > 100)
      .pop();
    return pop ? pop.innerText : document.body.innerText.slice(-2000);
  });
  fs.writeFileSync(`${OUT}/${prefix}-display-options.txt`, menu);
  console.log('== DISPLAY OPTIONS ==\n' + menu.replace(/\n+/g, ' | ').slice(0, 1500));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
}

// Open Add filter popover
const filterBtn = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button[aria-label]')];
  const b = btns.find((b) => /add filter|filter/i.test(b.getAttribute('aria-label') || ''));
  if (!b) return null;
  const r = b.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
if (filterBtn) {
  await page.mouse.click(filterBtn.x, filterBtn.y);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/${prefix}-filter-menu.png` });
  const menu = await page.evaluate(() => {
    const pop = [
      ...document.querySelectorAll('[class*="popover"], [role="dialog"], [class*="Popover"]'),
    ]
      .filter((el) => el.getBoundingClientRect().width > 100)
      .pop();
    return pop ? pop.innerText : document.body.innerText.slice(-2000);
  });
  fs.writeFileSync(`${OUT}/${prefix}-filter-menu.txt`, menu);
  console.log('== FILTER MENU ==\n' + menu.replace(/\n+/g, ' | ').slice(0, 1500));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
}

await page.close();
await browser.close();
console.log('DONE');
