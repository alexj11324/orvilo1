// Cycles audit — Orvilo, patient single-pass (server is slow under 9-agent load).
import { chromium } from 'playwright';
import fs from 'node:fs';

const OUT = '/tmp/parity-cycles';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGE-ERR:', String(e).slice(0, 200)));

const snap = async (name) => {
  try {
    await page.screenshot({ path: `${OUT}/${name}.png`, timeout: 90000 });
    console.log('saved', name);
  } catch (e) {
    console.log('screenshot failed', name, String(e).slice(0, 120));
  }
};
const waitLoaded = async () => {
  for (let i = 0; i < 40; i++) {
    const txt = await page.evaluate(() => document.body.innerText.slice(0, 400)).catch(() => '');
    if (txt && !/Still loading/i.test(txt)) return txt;
    await page.waitForTimeout(3000);
  }
  return '(never loaded)';
};

const url = process.argv[2] || 'http://localhost:3010/agent-testing/inbox';
const name = process.argv[3] || 'orvilo-page';
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
const body = await waitLoaded();
console.log('FINAL URL:', page.url());
console.log('BODY:', body.slice(0, 2000));
await snap(name);
await page.close();
process.exit(0);
