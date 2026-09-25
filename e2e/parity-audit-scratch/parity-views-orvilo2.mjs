import fs from 'node:fs';
import { connect } from './_cdp.mjs';
const OUT = '/tmp/parity-views';
const browser = await connect();
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
page.setDefaultTimeout(60000);
await page.goto('http://localhost:3010/agent-testing/views', {
  waitUntil: 'domcontentloaded',
  timeout: 60000,
});
await page.waitForTimeout(8000);
const table = await page.evaluate(() => {
  const t = document.querySelector('table');
  return t ? t.outerHTML.slice(0, 9000) : 'NO TABLE';
});
fs.writeFileSync(`${OUT}/orvilo-dir-table.html`, table);
console.log('TABLE len:', table.length);
const links = await page.evaluate(() =>
  [...document.querySelectorAll('a[href*="/views/"]')].map((a) => ({
    href: a.getAttribute('href'),
    text: a.innerText.trim().slice(0, 60),
  })),
);
console.log('VIEW LINKS:', JSON.stringify(links));
await page.screenshot({ path: `${OUT}/orvilo-views-dir2.png` });
await page.close();
await browser.close();
console.log('DONE');
