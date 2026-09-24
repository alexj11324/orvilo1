// Parity verification helper — orchestrator's rig
// Usage: node parity-compare.mjs "<linear-url>" "<orvilo-url>" "<tag>" [extraWaitMs]
// Produces /tmp/parity-verify/<tag>-linear.png, <tag>-orvilo.png, <tag>-inventory.json
import { chromium } from 'playwright';
import fs from 'node:fs';

const [linearUrl, orviloUrl, tag = 'page', extraWait = '4000'] = process.argv.slice(2);
const OUT = '/tmp/parity-verify';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];

const INVENTORY_JS = `(() => {
  const els = [...document.querySelectorAll('a[href], button, [role="button"], [role="tab"], [role="menuitem"], [role="checkbox"], [role="switch"], input, [contenteditable="true"], [data-testid]')];
  return els.filter(e => {
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }).map(e => ({
    tag: e.tagName.toLowerCase(),
    role: e.getAttribute('role'),
    text: (e.innerText || e.value || e.getAttribute('placeholder') || '').trim().slice(0, 60),
    aria: e.getAttribute('aria-label'),
    href: e.getAttribute('href'),
    testid: e.getAttribute('data-testid'),
    x: Math.round(e.getBoundingClientRect().x),
    y: Math.round(e.getBoundingClientRect().y),
  }));
})()`;

async function cap(url, name) {
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(Number(extraWait));
  await page.screenshot({ path: `${OUT}/${tag}-${name}.png` });
  const inv = await page.evaluate(INVENTORY_JS).catch((e) => ({ error: String(e) }));
  return { url: page.url(), title: await page.title(), controls: inv };
}

const lin = await cap(linearUrl, 'linear');
const orv = await cap(orviloUrl, 'orvilo');
fs.writeFileSync(
  `${OUT}/${tag}-inventory.json`,
  JSON.stringify({ linear: lin, orvilo: orv }, null, 2),
);
console.log(
  `linear: ${lin.url} | controls=${Array.isArray(lin.controls) ? lin.controls.length : 'ERR'}`,
);
console.log(
  `orvilo: ${orv.url} | controls=${Array.isArray(orv.controls) ? orv.controls.length : 'ERR'}`,
);
console.log(`saved → ${OUT}/${tag}-*.png + inventory.json`);
process.exit(0);
