// Click-walk verification: open a page, click through a list of selectors,
// screenshot the reaction of each. For MY verification pass — compares
// post-fix Orvilo behavior against remembered Linear behavior.
// Usage: node parity-clickwalk.mjs "<url>" "<tag>" "<sel1|sel2|...>"
// Each sel: CSS/text selector. Steps named sel_1..N → /tmp/parity-verify/walk-<tag>-NN.png
import { chromium } from 'playwright';
import fs from 'node:fs';

const [url, tag = 'page', selsArg = ''] = process.argv.slice(2);
const OUT = '/tmp/parity-verify';
fs.mkdirSync(OUT, { recursive: true });
const selectors = selsArg.split('|').filter(Boolean);

const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
// wait for app shell: heuristic — sidebar nav links present
await page
  .waitForSelector('nav a[href]', { timeout: 60000 })
  .catch(() => console.log('WARN: nav not found'));
await page.waitForTimeout(8000);
await page.screenshot({ path: `${OUT}/walk-${tag}-00-initial.png` });
console.log('landed:', page.url());

let i = 0;
for (const sel of selectors) {
  i++;
  const shot = `${OUT}/walk-${tag}-${String(i).padStart(2, '0')}.png`;
  try {
    let loc;
    if (sel.startsWith('text=') || sel.startsWith('role=')) {
      const t = sel.slice(5);
      loc = sel.startsWith('text=')
        ? page.locator(`text=${t}`)
        : page.getByRole('button', { name: new RegExp(t, 'i') });
    } else {
      loc = page.locator(sel);
    }
    const n = await loc.count();
    console.log(`[${i}] ${sel} → ${n} match`);
    if (!n) {
      fs.writeFileSync(shot.replace('.png', '.txt'), 'NOT FOUND');
      continue;
    }
    await loc
      .first()
      .scrollIntoViewIfNeeded()
      .catch(() => {});
    await loc.first().click({ timeout: 8000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: shot });
    // dump any newly-opened menu/popover items
    const menu = await page
      .evaluate(
        `(() => {
      const m = document.querySelector('[role="menu"],[role="listbox"],[role="dialog"],[data-radix-popper-content-wrapper],[class*="popover" i],[class*="dropdown" i],[class*="menu" i]');
      if (!m) return null;
      return [...m.querySelectorAll('[role="menuitem"],[role="option"],li,button,[role="menuitemcheckbox"],[role="menuitemradio"]')].map(e => (e.innerText||'').trim().slice(0,50)).filter(Boolean);
    })()`,
      )
      .catch(() => null);
    if (menu) console.log(`   menu items: ${JSON.stringify(menu.slice(0, 30))}`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  } catch (e) {
    console.log(`[${i}] ${sel} ERR: ${String(e).split('\n')[0]}`);
    fs.writeFileSync(shot.replace('.png', '.txt'), 'ERR ' + String(e).split('\n')[0]);
  }
}
console.log('WALK DONE');
process.exit(0);
