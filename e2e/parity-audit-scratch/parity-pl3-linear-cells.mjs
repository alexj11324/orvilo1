/* Linear projects — focused probe: what do icon + issues cell clicks do?
   Reuses the existing Linear tab; restores URL afterwards. */
import { chromium } from 'playwright';
import fs from 'node:fs';

const OUT =
  '/Users/devin/repos/wt-parity-projects-list/.agents/runtime-acceptance/parity-2026-09-23/projects-list';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.connectOverCDP('http://localhost:9222', { timeout: 120000 });
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => p.url().includes('linear.app')) || (await ctx.newPage());
await page.setViewportSize({ width: 1440, height: 900 });
try {
  await page.goto('https://linear.app/bdiverifier/projects/all', {
    waitUntil: 'commit',
    timeout: 30000,
  });
} catch {}
await page.bringToFront().catch(() => {});
await page.waitForTimeout(9000);
console.log('URL:', page.url());

const firstRowBtnNearX = async (xTarget) =>
  page.evaluate((x) => {
    const rows = [...document.querySelectorAll('a')].filter((a) => {
      const r = a.getBoundingClientRect();
      return r.width > 800 && r.height >= 40 && r.height <= 60 && r.y > 100;
    });
    const row = rows[0];
    if (!row) return null;
    const btns = [...row.querySelectorAll('button, [role="button"], input')];
    const b = btns.find((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && Math.abs(r.x + r.width / 2 - x) < 45;
    });
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return {
      x: r.x + r.width / 2,
      y: r.y + r.height / 2,
      label: b.getAttribute('aria-label') || b.innerText,
    };
  }, xTarget);

const describeOverlays = () =>
  page.evaluate(() => {
    const url = location.href;
    const dialogs = [
      ...document.querySelectorAll(
        '[role="dialog"], [role="listbox"], [role="menu"], [role="tooltip"], [class*="popover" i], [class*="Picker" i], [class*="picker" i]',
      ),
    ]
      .map((el) => {
        const r = el.getBoundingClientRect();
        return {
          cls: (el.className || '').toString().slice(0, 80),
          role: el.getAttribute('role'),
          txt: (el.innerText || '').slice(0, 300),
          x: Math.round(r.x),
          y: Math.round(r.y),
          w: Math.round(r.width),
          h: Math.round(r.height),
        };
      })
      .filter((d) => d.w > 20 && d.h > 20);
    return { dialogs, url };
  });

// probe issues cell (x~1275) then icon cell (x~905)
for (const [tag, x] of [
  ['issues', 1275],
  ['icon', 905],
]) {
  const before = page.url();
  const box = await firstRowBtnNearX(x);
  console.log(`\n--- ${tag}: target`, JSON.stringify(box));
  if (!box) continue;
  await page.mouse.click(box.x, box.y);
  await page.waitForTimeout(1600);
  const after = page.url();
  const state = await describeOverlays();
  console.log(`${tag} url: ${before} -> ${after}`);
  console.log(`${tag} overlays:`, JSON.stringify(state.dialogs.slice(0, 5)));
  await page.screenshot({ path: `${OUT}/linear-probe-${tag}.png` });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
  if (page.url() !== before) {
    try {
      await page.goto(before, { waitUntil: 'commit', timeout: 20000 });
    } catch {}
    await page.waitForTimeout(6000);
  }
}
console.log('DONE');
