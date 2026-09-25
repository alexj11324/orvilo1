// Linear: display options per tab + bulk Actions menu + cleanup stray issue tab.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const SHOT = '/tmp/parity-my-issues';
mkdirSync(SHOT, { recursive: true });
const browser = await chromium.connectOverCDP('http://localhost:9222', { timeout: 180000 });
const ctx = browser.contexts()[0];
const log = (...a) => console.log(...a);

// close the stray issue tab my earlier cmd+click opened
for (const p of ctx.pages()) {
  if (p.url().includes('/issue/DAY123-79/')) {
    log('closing stray tab', p.url());
    await p.close().catch(() => {});
  }
}

const page = await ctx.newPage();
await page.setViewportSize({ width: 1440, height: 900 });
const shot = (n) => page.screenshot({ path: `${SHOT}/${n}.png` });

const goto = async (url, sel = 'button[aria-label="Display options"]') => {
  for (let i = 0; i < 3; i++) {
    await page
      .goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 })
      .catch((e) => log('goto warn', e.message));
    try {
      await page.waitForSelector(sel, { timeout: 40000 });
      return true;
    } catch {
      log('retry nav', i);
    }
  }
  return false;
};

// dump the deepest floating panel containing menu-ish text
const dumpPanel = async (tag) => {
  const data = await page.evaluate(() => {
    const panels = [];
    document.querySelectorAll('body *').forEach((el) => {
      const cs = getComputedStyle(el);
      if (cs.position !== 'fixed' && cs.position !== 'absolute') return;
      const r = el.getBoundingClientRect();
      if (r.width < 120 || r.height < 60 || r.width > 800) return;
      const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (!t) return;
      panels.push({ el, r, t });
    });
    // keep only panels that have interactive children and aren't nested inside another panel
    const top = panels.filter((p) => !panels.some((q) => q !== p && q.el.contains(p.el)));
    return top.map((p) => {
      const rows = [];
      p.el.querySelectorAll('*').forEach((item) => {
        const ir = item.getBoundingClientRect();
        if (ir.width === 0 || ir.height === 0) return;
        const role = item.getAttribute('role');
        const tag = item.tagName.toLowerCase();
        const isInteractive =
          role ||
          tag === 'button' ||
          tag === 'input' ||
          tag === 'a' ||
          item.getAttribute('tabindex') !== null;
        const ownText = [...item.childNodes]
          .filter((n) => n.nodeType === 3)
          .map((n) => n.textContent.trim())
          .join(' ')
          .trim();
        if (!isInteractive && !ownText) return;
        rows.push({
          tag,
          role: role || undefined,
          text: (ownText || (item.childElementCount === 0 ? item.textContent : '') || '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 55),
          fullText: undefined,
          aria: item.getAttribute('aria-label') || undefined,
          checked:
            item.getAttribute('aria-checked') ?? item.getAttribute('data-checked') ?? undefined,
          y: Math.round(ir.top),
        });
      });
      const seen = new Set();
      const deduped = rows.filter((r) => {
        const k = `${r.y}|${r.tag}|${r.text}|${r.aria}`;
        if (seen.has(k) || (!r.text && !r.aria && r.tag !== 'input')) return false;
        seen.add(k);
        return true;
      });
      return {
        rect: {
          x: Math.round(p.r.x),
          y: Math.round(p.r.y),
          w: Math.round(p.r.width),
          h: Math.round(p.r.height),
        },
        text: p.t.slice(0, 400),
        rows: deduped.slice(0, 110),
      };
    });
  });
  log(`=== ${tag} ===`);
  log(JSON.stringify(data, null, 1));
};

await goto('https://linear.app/bdiverifier/my-issues/assigned');
await page.waitForTimeout(2500);

// click Display options via real mouse at its coordinates (click() kept stalling)
const disp = await page.locator('button[aria-label="Display options"]').first().boundingBox();
log('disp box', JSON.stringify(disp));
await page.mouse.click(disp.x + disp.width / 2, disp.y + disp.height / 2);
await page.waitForTimeout(1500);
await shot('linear-display-assigned');
await dumpPanel('DISPLAY assigned');
await page.keyboard.press('Escape');
await page.waitForTimeout(500);

for (const tab of ['created', 'subscribed', 'activity']) {
  await goto(`https://linear.app/bdiverifier/my-issues/${tab}`);
  await page.waitForTimeout(2500);
  log(`##### TAB ${tab} | TITLE: ${await page.title()}`);
  await shot(`linear-${tab}`);
  const heads = await page.evaluate(() => {
    const out = [];
    document
      .querySelectorAll(
        '[data-list-group-divider="true"], [data-list-row="true"][data-list-key^="GROUP"]',
      )
      .forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width > 300)
          out.push({
            text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60),
            y: Math.round(r.top),
            h: Math.round(r.height),
          });
      });
    return {
      headers: out.slice(0, 15),
      rows: document.querySelectorAll('a[data-list-row="true"]').length,
    };
  });
  log('HEADERS+ROWS:', JSON.stringify(heads));
  const d2 = await page.locator('button[aria-label="Display options"]').first().boundingBox();
  await page.mouse.click(d2.x + d2.width / 2, d2.y + d2.height / 2);
  await page.waitForTimeout(1500);
  await shot(`linear-display-${tab}`);
  await dumpPanel(`DISPLAY ${tab}`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
}

// bulk bar Actions menu — back on assigned, select 2 rows via checkbox column
await goto('https://linear.app/bdiverifier/my-issues/assigned');
await page.waitForTimeout(2500);
const row1 = page.locator('a[data-list-row="true"]').first();
await row1.hover();
await page.waitForTimeout(400);
await row1
  .locator('[data-list-grid-column="checkbox"]')
  .first()
  .click({ position: { x: 9, y: 12 } })
  .catch((e) => log('cb1', e.message));
const row2 = page.locator('a[data-list-row="true"]').nth(1);
await row2.hover();
await row2
  .locator('[data-list-grid-column="checkbox"]')
  .first()
  .click({ position: { x: 9, y: 12 } })
  .catch((e) => log('cb2', e.message));
await page.waitForTimeout(900);
const actionsBtn = page
  .locator('button[aria-label="Open command menu"], button:has-text("Actions")')
  .first();
if (await actionsBtn.count()) {
  const ab = await actionsBtn.boundingBox();
  await page.mouse.click(ab.x + ab.width / 2, ab.y + ab.height / 2);
  await page.waitForTimeout(1200);
  await shot('linear-bulk-actions');
  await dumpPanel('BULK ACTIONS MENU');
  await page.keyboard.press('Escape');
}
await page.keyboard.press('Escape');

await page.close();
process.exit(0);
