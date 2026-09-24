// Linear my-issues audit part 3 — resilient waits.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const SHOT = '/tmp/parity-my-issues';
mkdirSync(SHOT, { recursive: true });
const browser = await chromium.connectOverCDP('http://localhost:9222', { timeout: 120000 });
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
await page.setViewportSize({ width: 1440, height: 900 });
const shot = (n) => page.screenshot({ path: `${SHOT}/${n}.png` });
const log = (...a) => console.log(...a);

const dumpOverlays = async (tag) => {
  const data = await page.evaluate(() => {
    const out = [];
    const seen = new Set();
    const roots = [
      ...document.querySelectorAll(
        '[data-radix-popper-content-wrapper], [role="dialog"], [role="menu"], [role="listbox"], [class*="popover" i], [class*="Popup" i], [class*="MenuContent" i]',
      ),
    ];
    for (const el of roots) {
      const r = el.getBoundingClientRect();
      if (r.width < 40 || r.height < 20 || seen.has(el)) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      seen.add(el);
      const rows = [];
      el.querySelectorAll(
        '[role="menuitem"], [role="option"], [role="menuitemcheckbox"], [role="menuitemradio"], [role="switch"], button, input, a',
      ).forEach((item) => {
        const ir = item.getBoundingClientRect();
        if (ir.width === 0 || ir.height === 0) return;
        rows.push({
          role: item.getAttribute('role') || item.tagName.toLowerCase(),
          aria: item.getAttribute('aria-label') || undefined,
          text: (item.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 70),
          checked: item.getAttribute('aria-checked') ?? undefined,
        });
      });
      out.push({
        role: el.getAttribute('role'),
        rect: {
          x: Math.round(r.x),
          y: Math.round(r.y),
          w: Math.round(r.width),
          h: Math.round(r.height),
        },
        textHead: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 160),
        rows: rows.slice(0, 100),
      });
    }
    return out;
  });
  log(`=== ${tag} ===`);
  log(JSON.stringify(data, null, 1));
};

// resilient goto: retry until the row anchor appears
for (let attempt = 0; attempt < 3; attempt++) {
  await page
    .goto('https://linear.app/bdiverifier/my-issues/assigned', {
      waitUntil: 'domcontentloaded',
      timeout: 90000,
    })
    .catch((e) => log('goto warn', e.message));
  try {
    await page.waitForSelector('a[data-list-row="true"], button[aria-label="Display options"]', {
      timeout: 45000,
    });
    break;
  } catch {
    log('retry', attempt);
  }
}
await page.waitForTimeout(3000);
log('URL:', page.url(), '| rows:', await page.locator('a[data-list-row="true"]').count());

// ---- row cells ----
const rowCols = await page.evaluate(() => {
  const row = document.querySelector('a[data-list-row="true"]');
  if (!row) return 'no row';
  const cells = [];
  row.querySelectorAll('[data-list-grid-column]').forEach((c) => {
    const r = c.getBoundingClientRect();
    cells.push({
      col: c.getAttribute('data-list-grid-column'),
      x: Math.round(r.x),
      w: Math.round(r.width),
      text: (c.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60),
    });
  });
  return {
    grid:
      row.style.getPropertyValue('--x-gridTemplateColumns') ||
      row.getAttribute('style')?.slice(0, 200),
    cells,
  };
});
log('=== LINEAR ROW CELLS ===');
log(JSON.stringify(rowCols, null, 1));

// ---- group headers (search broadly) ----
const groups = await page.evaluate(() => {
  const out = [];
  document.querySelectorAll('*').forEach((el) => {
    if (el.children.length > 6) return;
    const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (
      !/^(Urgent issues|Blocking issues|Backlog|Todo|In Progress|In Review|Done|Canceled|Cancelled|Completed|Triage|Today|Yesterday|Earlier)/i.test(
        t,
      )
    )
      return;
    if (t.length > 70) return;
    const r = el.getBoundingClientRect();
    if (r.top < 100 || r.top > 880 || r.width < 200 || r.height > 60 || r.height < 10) return;
    out.push({
      tag: el.tagName,
      role: el.getAttribute('role'),
      text: t.slice(0, 70),
      y: Math.round(r.top),
      h: Math.round(r.height),
      w: Math.round(r.width),
    });
  });
  // dedupe nested
  return out
    .filter((o, i) => !out.some((p, j) => j < i && p.y === o.y && p.text.includes(o.text)))
    .slice(0, 30);
});
log('=== LINEAR GROUP HEADERS ===');
log(JSON.stringify(groups, null, 1));

// ---- display options ----
const dispBtn = page.locator('button[aria-label="Display options"]').first();
if (await dispBtn.count()) {
  await dispBtn.click();
  await page.waitForTimeout(1200);
  await shot('linear-display-options2');
  await dumpOverlays('DISPLAY OPTIONS assigned');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
} else {
  log('NO DISPLAY OPTIONS BTN');
}

// ---- hover group header for + button ----
const hdrRow = await page.evaluate(() => {
  const row = document.querySelector('a[data-list-row="true"]');
  if (!row) return null;
  // walk up to find the group container, then its header sibling
  let el = row;
  for (let i = 0; i < 8 && el; i++) {
    if (el.previousElementSibling) {
      const prev = el.previousElementSibling;
      const rt = prev.getBoundingClientRect();
      if (rt.height > 10 && rt.height < 60 && rt.width > 300) {
        return {
          y: rt.top + rt.height / 2,
          text: (prev.textContent || '').trim().slice(0, 60),
          html: prev.outerHTML.slice(0, 900),
        };
      }
    }
    el = el.parentElement;
  }
  return null;
});
log('=== GROUP HEADER PROBE ===');
log(JSON.stringify(hdrRow, null, 1)?.slice(0, 1500));
if (hdrRow) {
  await page.mouse.move(700, hdrRow.y);
  await page.waitForTimeout(800);
  await shot('linear-group-hover');
  const plus = await page.evaluate((y) => {
    const out = [];
    document.querySelectorAll('button, [role="button"], a').forEach((b) => {
      const r = b.getBoundingClientRect();
      if (r.width > 0 && Math.abs(r.top + r.height / 2 - y) < 25) {
        out.push({
          aria: b.getAttribute('aria-label'),
          text: (b.textContent || '').trim().slice(0, 30),
          x: Math.round(r.x),
          tag: b.tagName,
        });
      }
    });
    return out;
  }, hdrRow.y);
  log('=== ELEMENTS AT HEADER Y ===');
  log(JSON.stringify(plus));
}

// ---- status cell click ----
const statusCell = page
  .locator('a[data-list-row="true"]')
  .first()
  .locator('[data-list-grid-column="status"]');
if (await statusCell.count()) {
  await statusCell.click({ position: { x: 8, y: 10 } });
  await page.waitForTimeout(1200);
  await shot('linear-status-picker');
  await dumpOverlays('STATUS PICKER');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
}

// ---- multiselect via checkbox cell ----
const row1 = page.locator('a[data-list-row="true"]').first();
await row1.hover();
await page.waitForTimeout(600);
const cb1 = row1.locator('[data-list-grid-column="checkbox"]').first();
await cb1.click({ position: { x: 9, y: 12 } });
await page.waitForTimeout(500);
const row2 = page.locator('a[data-list-row="true"]').nth(1);
await row2.hover();
await row2
  .locator('[data-list-grid-column="checkbox"]')
  .first()
  .click({ position: { x: 9, y: 12 } })
  .catch((e) => log('cb2', e.message));
await page.waitForTimeout(1000);
await shot('linear-multiselect2');
const bar = await page.evaluate(() => {
  const out = [];
  document.querySelectorAll('button, [role="button"], [role="menuitem"]').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.top > 680 && r.width > 0)
      out.push({
        aria: el.getAttribute('aria-label'),
        text: (el.textContent || '').trim().slice(0, 40),
        y: Math.round(r.top),
      });
  });
  return out;
});
log('=== BULK BOTTOM ===');
log(JSON.stringify(bar));
// dump fixed-position bar
const fixedBar = await page.evaluate(() => {
  const out = [];
  document.querySelectorAll('div').forEach((el) => {
    const cs = getComputedStyle(el);
    if (cs.position !== 'fixed' && cs.position !== 'absolute') return;
    const r = el.getBoundingClientRect();
    if (r.top < 600 || r.width < 200) return;
    const btns = [...el.querySelectorAll('button')].map((b) =>
      (b.getAttribute('aria-label') || b.textContent || '').trim().slice(0, 40),
    );
    if (btns.length)
      out.push({
        text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120),
        btns: btns.slice(0, 20),
      });
  });
  return out.slice(0, 10);
});
log('=== FIXED BAR ===');
log(JSON.stringify(fixedBar));

await page.close();
process.exit(0);
