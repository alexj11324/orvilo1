// Cycles audit — Orvilo, resilient connect + patient waits.
import { chromium } from 'playwright';
import fs from 'node:fs';

const OUT = '/tmp/parity-cycles';
fs.mkdirSync(OUT, { recursive: true });

let browser;
for (let i = 0; i < 5; i++) {
  try {
    browser = await chromium.connectOverCDP('http://localhost:9222', { timeout: 60000 });
    break;
  } catch (e) {
    console.log('connect retry', i, String(e).slice(0, 100));
    await new Promise((r) => setTimeout(r, 5000));
  }
}
if (!browser) {
  console.log('CDP UNREACHABLE');
  process.exit(1);
}
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
page.setDefaultTimeout(120000);

const snap = async (name) => {
  try {
    await page.screenshot({ path: `${OUT}/${name}.png`, timeout: 60000 });
    console.log('saved', name);
  } catch (e) {
    console.log('screenshot failed', name, String(e).slice(0, 100));
  }
};
const waitLoaded = async () => {
  for (let i = 0; i < 50; i++) {
    const txt = await page.evaluate(() => document.body.innerText.slice(0, 500)).catch(() => '');
    if (txt && !/Still loading/i.test(txt)) return txt;
    await page.waitForTimeout(3000);
  }
  return '(never loaded)';
};

const url = process.argv[2];
const name = process.argv[3];
const expr = process.argv[4]; // optional JS to eval after load
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
const body = await waitLoaded();
console.log('FINAL URL:', page.url());
console.log('BODY:', body.slice(0, 2200));
if (expr) {
  try {
    const res = await page.evaluate(expr);
    console.log('EVAL:', JSON.stringify(res).slice(0, 3000));
  } catch (e) {
    console.log('eval failed', String(e).slice(0, 150));
  }
}
await snap(name);
await page.close();
process.exit(0);
