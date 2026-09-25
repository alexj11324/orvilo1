// Mega audit: ONE CDP connection → login check → Orvilo audit → Linear audits.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const SHOT = '/tmp/parity-my-issues';
mkdirSync(SHOT, { recursive: true });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

const browser = await chromium.connectOverCDP('http://localhost:9222', { timeout: 300000 });
log('connected');
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
await page.setViewportSize({ width: 1440, height: 900 });
const shot = (n) => page.screenshot({ path: `${SHOT}/${n}.png` });

// ---------- helpers ----------
const gotoWait = async (url, sel, timeout = 45000) => {
  for (let i = 0; i < 3; i++) {
    await page
      .goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 })
      .catch((e) => log('goto warn', e.message));
    try {
      await page.waitForSelector(sel, { timeout });
      return true;
    } catch {
      log('retry', url, i);
    }
  }
  return false;
};

const dumpPanels = async (tag) => {
  const data = await page.evaluate(() => {
    const panels = [];
    document.querySelectorAll('body *').forEach((el) => {
      const cs = getComputedStyle(el);
      if (cs.position !== 'fixed' && cs.position !== 'absolute') return;
      const r = el.getBoundingClientRect();
      if (r.width < 80 || r.height < 30 || r.width > 900) return;
      const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (!t) return;
      panels.push({ el, r, t });
    });
    const top = panels.filter((p) => !panels.some((q) => q !== p && q.el.contains(p.el)));
    return top.map((p) => {
      const rows = [];
      p.el.querySelectorAll('*').forEach((item) => {
        const ir = item.getBoundingClientRect();
        if (ir.width === 0 || ir.height === 0) return;
        const role = item.getAttribute('role');
        const tg = item.tagName.toLowerCase();
        const interactive =
          role ||
          tg === 'button' ||
          tg === 'input' ||
          tg === 'a' ||
          item.getAttribute('tabindex') !== null;
        const ownText = [...item.childNodes]
          .filter((n) => n.nodeType === 3)
          .map((n) => n.textContent.trim())
          .join(' ')
          .trim();
        if (!interactive && !ownText) return;
        rows.push({
          tag: tg,
          role: role || undefined,
          text: (ownText || (item.childElementCount === 0 ? item.textContent : '') || '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 55),
          aria: item.getAttribute('aria-label') || item.getAttribute('title') || undefined,
          checked:
            item.getAttribute('aria-checked') ?? item.getAttribute('data-checked') ?? undefined,
          expanded: item.getAttribute('aria-expanded') ?? undefined,
          y: Math.round(ir.top),
          x: Math.round(ir.left),
        });
      });
      const seen = new Set();
      const deduped = rows.filter((r) => {
        const k = `${r.y}|${r.x}|${r.tag}|${r.text}|${r.aria}`;
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
        text: p.t.slice(0, 300),
        rows: deduped.slice(0, 110),
      };
    });
  });
  log(`=== ${tag} ===`);
  log(JSON.stringify(data, null, 1));
};

// ---------- 1. Orvilo session check + login ----------
await page
  .goto('http://localhost:3010/agent-testing/my-issues', {
    waitUntil: 'domcontentloaded',
    timeout: 90000,
  })
  .catch((e) => log('goto warn', e.message));
await page.waitForTimeout(8000);
log('orvilo URL:', page.url());
if (page.url().includes('/signin')) {
  log('NEED LOGIN');
  await page.waitForSelector('input', { timeout: 30000 });
  const email = page.locator('input[type="text"], input[type="email"]').first();
  await email.click();
  await email.fill('agent-testing@orvilo.aspectlylabs.com');
  await page.waitForTimeout(400);
  const label = page.locator('text=/I have read and agree/i').first();
  if (await label.count()) {
    await label.click().catch(() => {});
    await page.waitForTimeout(700);
  }
  await shot('login-before-next');
  await page
    .locator('button[type="submit"], button:has-text("Next")')
    .first()
    .click()
    .catch((e) => log('next1', e.message));
  await page.waitForTimeout(3000);
  const agree = page.getByRole('button', { name: /agree and continue/i });
  if (
    (await agree.count()) &&
    (await agree
      .first()
      .isVisible()
      .catch(() => false))
  ) {
    await agree.first().click();
    await page.waitForTimeout(1500);
  }
  // password?
  let pwd = page.locator('input[type="password"]').first();
  if (!(await pwd.count()) || !(await pwd.isVisible().catch(() => false))) {
    // maybe still on email step — click Next again
    const next2 = page.locator('button[type="submit"], button:has-text("Next")').first();
    if ((await next2.count()) && (await next2.isVisible().catch(() => false))) {
      await next2.click().catch(() => {});
      await page.waitForTimeout(4000);
    }
  }
  pwd = page.locator('input[type="password"]').first();
  if ((await pwd.count()) && (await pwd.isVisible().catch(() => false))) {
    await pwd.fill('TestPassword123!');
    await page
      .locator('button[type="submit"]')
      .first()
      .click()
      .catch((e) => log('submit', e.message));
    await page.waitForTimeout(10000);
  }
  log('post-login URL:', page.url());
  await page
    .goto('http://localhost:3010/agent-testing/my-issues', {
      waitUntil: 'domcontentloaded',
      timeout: 90000,
    })
    .catch((e) => log('goto2 warn', e.message));
  await page.waitForTimeout(10000);
}
log('orvilo final URL:', page.url(), '| TITLE:', await page.title());
await shot('orvilo-assigned');

// ---------- 2. Orvilo header / tabs / rows ----------
const orviloTop = await page.evaluate(() => {
  const out = { tabs: [], buttons: [], rows: 0, groups: [] };
  document.querySelectorAll('[role="tab"]').forEach((el) => {
    const r = el.getBoundingClientRect();
    out.tabs.push({
      text: (el.textContent || '').trim().slice(0, 30),
      sel: el.getAttribute('aria-selected'),
      x: Math.round(r.x),
      y: Math.round(r.y),
      w: Math.round(r.width),
      h: Math.round(r.height),
    });
  });
  document.querySelectorAll('button[aria-label], [role="button"][aria-label]').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.top < 140 && r.width > 0)
      out.buttons.push({
        aria: el.getAttribute('aria-label'),
        x: Math.round(r.x),
        y: Math.round(r.y),
      });
  });
  out.rows = document.querySelectorAll('[data-bulk-row-id]').length;
  document.querySelectorAll('button[aria-expanded]').forEach((b) => {
    const r = b.getBoundingClientRect();
    if (r.top > 100 && r.width > 300)
      out.groups.push({
        text: (b.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 50),
        y: Math.round(r.top),
        h: Math.round(r.height),
        exp: b.getAttribute('aria-expanded'),
      });
  });
  return out;
});
log('=== ORVILO TOP ===');
log(JSON.stringify(orviloTop, null, 1));

// filter menu
const fbtn = page.locator('button[aria-label*="filter" i]').last();
if (await fbtn.count()) {
  await fbtn.click({ timeout: 15000 }).catch((e) => log('fclick', e.message));
  await page.waitForTimeout(1000);
  await shot('orvilo-add-filter');
  await dumpPanels('ORVILO ADD FILTER');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
}
// display options
const dbtn = page.locator('button[aria-label*="isplay" i]').last();
if (await dbtn.count()) {
  await dbtn.click({ timeout: 15000 }).catch((e) => log('dclick', e.message));
  await page.waitForTimeout(1000);
  await shot('orvilo-display');
  await dumpPanels('ORVILO DISPLAY');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
}
// first row anatomy
const orvRow = await page.evaluate(() => {
  const row = document.querySelector('[data-bulk-row-id]');
  if (!row) return 'no row';
  const cells = [];
  const walk = (el, d) => {
    if (d > 5 || !el) return;
    const r = el.getBoundingClientRect?.();
    if (!r || r.width === 0) return;
    const own = [...(el.childNodes || [])]
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent.trim())
      .join(' ');
    cells.push({
      d,
      tag: el.tagName?.toLowerCase(),
      x: Math.round(r.x),
      w: Math.round(r.width),
      text:
        own.slice(0, 40) ||
        (el.childElementCount === 0 ? (el.textContent || '').trim().slice(0, 40) : ''),
      aria: el.getAttribute?.('aria-label') || undefined,
      collab:
        el.getAttribute?.('data-collab-id-alt') || el.getAttribute?.('data-collab-id') || undefined,
    });
    [...el.children].slice(0, 10).forEach((c) => walk(c, d + 1));
  };
  walk(row, 0);
  return cells;
});
log('=== ORVILO ROW TREE ===');
log(JSON.stringify(orvRow, null, 1));

// row hover + right-click + status click
const row1 = page.locator('[data-bulk-row-id]').first();
if (await row1.count()) {
  await row1.hover();
  await page.waitForTimeout(600);
  await shot('orvilo-row-hover');
  await row1.click({ button: 'right' }).catch((e) => log('rclick', e.message));
  await page.waitForTimeout(1000);
  await shot('orvilo-context');
  await dumpPanels('ORVILO CONTEXT MENU');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  // status icon click — the collab status span's inner clickable
  const statusEl = row1.locator('[data-collab-id-alt$=":status"]').first();
  if (await statusEl.count()) {
    await statusEl.click({ timeout: 10000 }).catch((e) => log('statusclick', e.message));
    await page.waitForTimeout(1000);
    await shot('orvilo-status-picker');
    await dumpPanels('ORVILO STATUS PICKER');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  }
  // assignee avatar click
  const asg = row1.locator('[data-collab-id-alt$=":assignee"]').first();
  if (await asg.count()) {
    await asg.click({ timeout: 10000 }).catch((e) => log('asgclick', e.message));
    await page.waitForTimeout(1000);
    await shot('orvilo-assignee-picker');
    await dumpPanels('ORVILO ASSIGNEE PICKER');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  }
  // multi-select cmd+click (SPA intercepts — no nav)
  const rows = page.locator('[data-bulk-row-id]');
  if ((await rows.count()) >= 2) {
    await rows
      .nth(0)
      .click({ modifiers: ['Meta'] })
      .catch((e) => log('mc1', e.message));
    await rows
      .nth(1)
      .click({ modifiers: ['Meta'] })
      .catch((e) => log('mc2', e.message));
    await page.waitForTimeout(900);
    await shot('orvilo-multiselect');
    const bulk = await page.evaluate(() => {
      const bar = document.querySelector('[data-bulk-actions]');
      if (!bar) return null;
      return {
        text: (bar.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120),
        buttons: [...bar.querySelectorAll('button')].map((b) =>
          (b.getAttribute('aria-label') || b.getAttribute('title') || b.textContent || '')
            .trim()
            .slice(0, 40),
        ),
      };
    });
    log('=== ORVILO BULK BAR ===', JSON.stringify(bulk));
    await page.keyboard.press('Escape');
  }
}
// open details toggle
const detBtn = page.locator('button[aria-label*="details" i]').last();
if (await detBtn.count()) {
  await detBtn.click({ timeout: 10000 }).catch((e) => log('detclick', e.message));
  await page.waitForTimeout(600);
  // click a row to open peek
  await row1.click({ timeout: 10000 }).catch((e) => log('rowclick', e.message));
  await page.waitForTimeout(2500);
  await shot('orvilo-peek');
  const pane = await page.evaluate(() => {
    const p = document.querySelector('aside[aria-label]');
    return p
      ? { aria: p.getAttribute('aria-label'), w: Math.round(p.getBoundingClientRect().width) }
      : null;
  });
  log('=== ORVILO PEEK PANE ===', JSON.stringify(pane));
  await page.keyboard.press('Escape');
}

// ---------- 3. Linear sibling tabs quick ----------
for (const tab of ['created', 'subscribed', 'activity']) {
  const ok = await gotoWait(
    `https://linear.app/bdiverifier/my-issues/${tab}`,
    'button[aria-label="Display options"]',
  );
  if (!ok) continue;
  await page.waitForTimeout(3000);
  log(`##### LINEAR TAB ${tab} | TITLE: ${await page.title()}`);
  await shot(`linear-${tab}`);
  const info = await page.evaluate(() => {
    const out = { headers: [], rows: 0, cols: null };
    document
      .querySelectorAll(
        '[data-list-group-divider="true"], [data-list-row="true"][data-list-key^="GROUP"]',
      )
      .forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width > 300)
          out.headers.push({
            text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 50),
            y: Math.round(r.top),
          });
      });
    const row = document.querySelector('a[data-list-row="true"]');
    out.rows = document.querySelectorAll('a[data-list-row="true"]').length;
    if (row) out.cols = row.style.getPropertyValue('--x-gridTemplateColumns');
    return out;
  });
  log('TAB INFO:', JSON.stringify(info));
  // display options
  const db = await page.locator('button[aria-label="Display options"]').first().boundingBox();
  if (db) {
    await page.mouse.click(db.x + db.width / 2, db.y + db.height / 2);
    await page.waitForTimeout(1500);
    await shot(`linear-display-${tab}`);
    await dumpPanels(`DISPLAY ${tab}`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  }
}
// assigned display options too
await gotoWait('https://linear.app/bdiverifier/my-issues/assigned');
await page.waitForTimeout(2500);
const db0 = await page.locator('button[aria-label="Display options"]').first().boundingBox();
if (db0) {
  await page.mouse.click(db0.x + db0.width / 2, db0.y + db0.height / 2);
  await page.waitForTimeout(1500);
  await shot('linear-display-assigned');
  await dumpPanels('DISPLAY assigned');
  await page.keyboard.press('Escape');
}
// bulk actions menu on linear
const lrow1 = page.locator('a[data-list-row="true"]').first();
if (await lrow1.count()) {
  await lrow1.hover();
  await page.waitForTimeout(400);
  await lrow1
    .locator('[data-list-grid-column="checkbox"]')
    .first()
    .click({ position: { x: 9, y: 12 } })
    .catch((e) => log('cb1', e.message));
  const lrow2 = page.locator('a[data-list-row="true"]').nth(1);
  await lrow2.hover();
  await lrow2
    .locator('[data-list-grid-column="checkbox"]')
    .first()
    .click({ position: { x: 9, y: 12 } })
    .catch((e) => log('cb2', e.message));
  await page.waitForTimeout(900);
  await shot('linear-multiselect3');
  const actionsBtn = page
    .locator('button[aria-label="Open command menu"], button:has-text("Actions")')
    .first();
  if (await actionsBtn.count()) {
    const ab = await actionsBtn.boundingBox();
    await page.mouse.click(ab.x + ab.width / 2, ab.y + ab.height / 2);
    await page.waitForTimeout(1400);
    await shot('linear-bulk-actions');
    await dumpPanels('BULK ACTIONS MENU');
    await page.keyboard.press('Escape');
  }
  await page.keyboard.press('Escape');
}

await page.close();
log('ALL DONE');
process.exit(0);
