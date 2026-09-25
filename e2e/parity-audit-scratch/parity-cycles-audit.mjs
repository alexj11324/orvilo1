// Cycles parity audit — Linear side (read-only).
// 1) /bdiverifier/team/ORV/cycles reachability
// 2) sidebar Try-group Cycles row (link? target?)
// 3) team settings cycles enablement surface
import { chromium } from 'playwright';
import fs from 'node:fs';

const OUT = '/tmp/parity-cycles';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const page = await ctx.newPage();

const shot = async (name) => {
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
  console.log(`saved ${OUT}/${name}.png`);
};

// ── 1. cycles page ──────────────────────────────────────────────────────────
await page.goto('https://linear.app/bdiverifier/team/ORV/cycles', {
  waitUntil: 'domcontentloaded',
});
await page.waitForTimeout(6000);
console.log('URL after nav:', page.url());
console.log('TITLE:', await page.title());
const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 3000));
console.log('BODY (first 3000):\n', bodyText);
await shot('linear-team-cycles-url');

// ── 2. sidebar Try group ────────────────────────────────────────────────────
const tryInfo = await page.evaluate(() => {
  const nav = document.querySelector('nav') || document.body;
  const rows = [];
  // find elements whose text is exactly-ish Cycles / Initiatives / Try
  const walker = document.createTreeWalker(nav, NodeFilter.SHOW_ELEMENT);
  const hits = [];
  while (walker.nextNode()) {
    const el = walker.currentNode;
    const txt = (el.textContent || '').trim();
    if (['Cycles', 'Initiatives', 'Try'].includes(txt)) hits.push(el);
  }
  for (const el of hits) {
    const rect = el.getBoundingClientRect();
    const anchor = el.tagName === 'A' ? el : el.querySelector('a') || el.closest('a');
    const btn = el.tagName === 'BUTTON' ? el : el.querySelector('button') || el.closest('button');
    rows.push({
      text: (el.textContent || '').trim(),
      tag: el.tagName,
      cls: (el.className || '').toString().slice(0, 120),
      y: Math.round(rect.y),
      visible: rect.width > 0 && rect.height > 0,
      anchorHref: anchor ? anchor.getAttribute('href') : null,
      isAnchor: el.tagName === 'A',
      isButton: !!btn,
      role: el.getAttribute('role'),
      ariaExpanded: el.getAttribute('aria-expanded'),
      outerSnippet: el.outerHTML.slice(0, 300),
    });
  }
  return rows;
});
console.log('TRY-GROUP ROWS:', JSON.stringify(tryInfo, null, 2));

// ── 3. team settings cycles toggle ─────────────────────────────────────────
await page.goto('https://linear.app/bdiverifier/settings/teams/ORV', {
  waitUntil: 'domcontentloaded',
});
await page.waitForTimeout(6000);
console.log('settings URL:', page.url());
const settingsText = await page.evaluate(() => document.body.innerText.slice(0, 4000));
console.log('SETTINGS BODY (first 4000):\n', settingsText);
await shot('linear-team-settings');

// look for cycles-related controls in settings DOM
const settingsCycles = await page.evaluate(() => {
  const out = [];
  const all = document.querySelectorAll('*');
  for (const el of all) {
    const t = (el.textContent || '').trim();
    if (el.children.length === 0 && /cycle/i.test(t) && t.length < 200) {
      const r = el.getBoundingClientRect();
      out.push({ text: t, tag: el.tagName, y: Math.round(r.y), visible: r.width > 0 });
    }
  }
  return out.slice(0, 30);
});
console.log('SETTINGS CYCLE MENTIONS:', JSON.stringify(settingsCycles, null, 2));

await page.close();
process.exit(0);
