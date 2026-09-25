// Linear display options + sibling tabs probe.
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

const goto = async (url) => {
  for (let i = 0; i < 3; i++) {
    await page
      .goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 })
      .catch((e) => log('goto warn', e.message));
    try {
      await page.waitForSelector('button[aria-label="Display options"]', { timeout: 40000 });
      return;
    } catch {
      log('retry nav', i);
    }
  }
};

// dump every visible floating panel by scanning text content
const dumpPanel = async (tag) => {
  const data = await page.evaluate(() => {
    // find the deepest element containing 'Display' or 'ordering' that's panel-sized
    const candidates = [];
    document.querySelectorAll('div, section, ul, form').forEach((el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (r.width < 100 || r.width > 700 || r.height < 60 || r.height > 800) return;
      if (cs.position !== 'fixed' && cs.position !== 'absolute') return;
      const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (!/ordering|grouping|display|completed|sub-issues|layout/i.test(t)) return;
      candidates.push({ el, r, t });
    });
    // pick the smallest-area candidate (innermost panel)
    candidates.sort((a, b) => a.r.width * a.r.height - b.r.width * b.r.height);
    const picked = candidates[0];
    if (!picked) return null;
    const rows = [];
    picked.el.querySelectorAll('*').forEach((item) => {
      const ir = item.getBoundingClientRect();
      if (ir.width === 0 || ir.height === 0 || ir.height > 60) return;
      const own = [...item.childNodes]
        .filter((n) => n.nodeType === 3)
        .map((n) => n.textContent.trim())
        .join(' ');
      const label = own || (item.childElementCount === 0 ? (item.textContent || '').trim() : '');
      const role = item.getAttribute('role');
      const tag = item.tagName.toLowerCase();
      if (!label && !role && tag !== 'input' && tag !== 'button') return;
      rows.push({
        tag,
        role: role || undefined,
        text: (label || item.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60),
        aria: item.getAttribute('aria-label') || undefined,
        checked: item.getAttribute('aria-checked') ?? undefined,
        pressed: item.getAttribute('aria-pressed') ?? undefined,
        y: Math.round(ir.top),
      });
    });
    // dedupe same y+text
    const seen = new Set();
    const deduped = rows.filter((r) => {
      const k = `${r.y}|${r.text}|${r.role}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    return {
      rect: {
        x: Math.round(picked.r.x),
        y: Math.round(picked.r.y),
        w: Math.round(picked.r.width),
        h: Math.round(picked.r.height),
      },
      fullText: picked.t.slice(0, 500),
      rows: deduped.slice(0, 120),
    };
  });
  log(`=== ${tag} ===`);
  log(JSON.stringify(data, null, 1));
};

await goto('https://linear.app/bdiverifier/my-issues/assigned');
await page.waitForTimeout(3000);
await page.locator('button[aria-label="Display options"]').first().click();
await page.waitForTimeout(1500);
await shot('linear-display-assigned');
await dumpPanel('DISPLAY assigned');
await page.keyboard.press('Escape');
await page.waitForTimeout(600);

for (const tab of ['created', 'subscribed', 'activity']) {
  await goto(`https://linear.app/bdiverifier/my-issues/${tab}`);
  await page.waitForTimeout(2500);
  log(`\n##### TAB ${tab} | TITLE: ${await page.title()}`);
  await shot(`linear-${tab}`);
  // group headers / first rows
  const heads = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('[data-list-group-divider="true"]').forEach((el) => {
      const r = el.getBoundingClientRect();
      out.push({
        text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60),
        y: Math.round(r.top),
      });
    });
    const rows = document.querySelectorAll('a[data-list-row="true"]').length;
    return { headers: out.slice(0, 15), rowAnchors: rows };
  });
  log('HEADERS+ROWS:', JSON.stringify(heads));
  // display options for this tab
  await page.locator('button[aria-label="Display options"]').first().click();
  await page.waitForTimeout(1500);
  await shot(`linear-display-${tab}`);
  await dumpPanel(`DISPLAY ${tab}`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
}

await page.close();
process.exit(0);
