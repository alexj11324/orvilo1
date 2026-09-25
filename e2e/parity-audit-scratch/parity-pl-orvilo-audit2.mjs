/* Orvilo projects audit on own chrome :9333 — assumes logged in. */
import fs from 'node:fs';
import { chromium } from 'playwright';

const OUT = '/tmp/parity-audit-2026-09-23/projects-list';
fs.mkdirSync(OUT, { recursive: true });
const base = process.argv[2] || 'http://localhost:3010';
const prefix = process.argv[3] || 'orvilo';

const browser = await chromium.connectOverCDP('http://127.0.0.1:9333', { timeout: 30000 });
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
await page.setViewportSize({ width: 1440, height: 900 });

// 1. Enable labs flag via settings page
try {
  await page.goto(`${base}/agent-testing/settings/labs`, { waitUntil: 'commit', timeout: 20000 });
} catch {}
await page.bringToFront().catch(() => {});
await page.waitForTimeout(8000);
console.log('labs url:', page.url());
const switches = await page.evaluate(() =>
  [...document.querySelectorAll('[role="switch"], input[type="checkbox"]')]
    .map((el) => {
      const r = el.getBoundingClientRect();
      let row = el;
      for (let i = 0; i < 6 && row.parentElement; i++) {
        row = row.parentElement;
        const txt = (row.innerText || '').trim();
        if (txt.length > 5 && txt.length < 300) break;
      }
      return {
        checked: String(el.getAttribute('aria-checked') ?? el.checked),
        label: (row.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 90),
        x: Math.round(r.x),
        y: Math.round(r.y),
      };
    })
    .filter((c) => c.y > 0 && c.x > 200),
);
console.log('SWITCHES:', JSON.stringify(switches));
const proj = switches.find((s) => /project/i.test(s.label));
if (proj && proj.checked !== 'true') {
  await page.mouse.click(proj.x + 8, proj.y + 8);
  await page.waitForTimeout(2500);
  console.log('enabled projects lab');
} else {
  console.log('proj switch:', JSON.stringify(proj));
}

// 2. Audit projects page
try {
  await page.goto(`${base}/agent-testing/projects`, { waitUntil: 'commit', timeout: 20000 });
} catch {}
await page.waitForTimeout(9000);
console.log('projects url:', page.url());
await page.screenshot({ path: `${OUT}/${prefix}-projects.png` });
const controls = await page.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll(
    'button, a[href], input, [role="button"], [role="combobox"], [role="tab"], [role="switch"], [role="checkbox"], [role="menuitem"]',
  )) {
    const r = el.getBoundingClientRect();
    if (r.width === 0) continue;
    out.push({
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute('role'),
      label:
        el.getAttribute('aria-label') ||
        el.getAttribute('title') ||
        (el.innerText || el.value || el.placeholder || '').replace(/\s+/g, ' ').trim().slice(0, 80),
      x: Math.round(r.x),
      y: Math.round(r.y),
      w: Math.round(r.width),
      h: Math.round(r.height),
      href: el.getAttribute('href') || undefined,
      disabled: el.disabled || el.getAttribute('aria-disabled') || undefined,
    });
  }
  return out;
});
fs.writeFileSync(`${OUT}/${prefix}-controls.json`, JSON.stringify(controls, null, 2));
console.log('== CONTROLS (x>240, y<750) ==');
for (const c of controls.filter((c) => c.x > 240 && c.y < 750)) {
  console.log(
    `${String(c.y).padStart(4)},${String(c.x).padStart(4)} ${c.tag}[${c.role || ''}] "${c.label}" ${c.w}x${c.h}${c.disabled ? ' DISABLED' : ''}${c.href ? ' ->' + c.href : ''}`,
  );
}
const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 2000));
console.log('BODY:', bodyText.replace(/\n/g, ' | ').slice(0, 1200));

// 3. Display options popover
const clickAria = async (re) => {
  const box = await page.evaluate((reSrc) => {
    const rx = new RegExp(reSrc, 'i');
    const b = [...document.querySelectorAll('button')].find((b) => {
      const r = b.getBoundingClientRect();
      return r.width > 0 && rx.test(b.getAttribute('aria-label') || b.getAttribute('title') || '');
    });
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, re.source);
  if (!box) return false;
  await page.mouse.click(box.x, box.y);
  return true;
};
const overlayText = async (tag) => {
  await page.waitForTimeout(1600);
  await page.screenshot({ path: `${OUT}/${prefix}-${tag}.png` });
  const txt = await page.evaluate(() => {
    const pops = [
      ...document.querySelectorAll(
        '[class*="popover" i], [role="dialog"], [role="menu"], [class*="Popup" i]',
      ),
    ]
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.width > 80 && r.height > 40)
      .sort((a, b) => b.r.width * b.r.height - a.r.width * a.r.height);
    return pops
      .slice(0, 3)
      .map(({ el }) => el.innerText)
      .join('\n----\n');
  });
  fs.writeFileSync(`${OUT}/${prefix}-${tag}.txt`, txt);
  console.log(`\n=== ${tag} ===\n` + txt.replace(/\n+/g, ' | ').slice(0, 1600));
};

if (await clickAria(/display options/i)) await overlayText('display-options');
await page.keyboard.press('Escape');
await page.waitForTimeout(700);
if (await clickAria(/add filter|filter/i)) await overlayText('filter-menu');
await page.keyboard.press('Escape');
await page.waitForTimeout(700);

// 4. right-click first row → context menu
const rowBox = await page.evaluate(() => {
  const links = [...document.querySelectorAll('a[aria-label]')].filter((a) => {
    const r = a.getBoundingClientRect();
    return r.width > 500 && r.y > 130 && r.y < 600;
  });
  const r = links[0]?.getBoundingClientRect();
  return r ? { x: r.x + 400, y: r.y + r.height / 2 } : null;
});
console.log('rowBox for context:', JSON.stringify(rowBox));
if (rowBox) {
  await page.mouse.click(rowBox.x, rowBox.y, { button: 'right' });
  await overlayText('context-menu');
  await page.keyboard.press('Escape');
}

await page.close();
await browser.close();
console.log('DONE');
