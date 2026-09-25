import { chromium } from 'playwright';
import fs from 'fs';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9817', { timeout: 30000 });
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => p.url().includes('linear.app')) || (await ctx.newPage());
await page.waitForTimeout(8000);
const url = page.url();
const text = (await page.evaluate(() => document.body.innerText)).slice(0, 800);
const links = await page.$$eval('a[href*="/project/"]', (els) =>
  els
    .map((a) => ({ href: a.getAttribute('href'), text: a.textContent.trim().slice(0, 60) }))
    .slice(0, 30),
);
fs.writeFileSync(
  '/tmp/parity-project-detail/check9817b.json',
  JSON.stringify({ url, text, links }, null, 1),
);
process.exit(0);
