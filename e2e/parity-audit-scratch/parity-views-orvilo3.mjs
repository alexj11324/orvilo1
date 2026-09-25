import fs from 'node:fs';
import { connect } from './_cdp.mjs';
const OUT = '/tmp/parity-views';
const browser = await connect(10);
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
page.setDefaultTimeout(60000);
const shot = async (n) => {
  await page.screenshot({ path: `${OUT}/${n}.png` });
  console.log('shot:', n);
};

// log API calls
page.on('response', async (res) => {
  const u = res.url();
  if (u.includes('savedView') || u.includes('workAttention') || u.includes('trpc')) {
    console.log('API', res.status(), u.slice(0, 140));
  }
});

await page.goto('http://localhost:3010/agent-testing/views', {
  waitUntil: 'domcontentloaded',
  timeout: 60000,
});
// wait for either a real row link or error or empty state
try {
  await page.waitForSelector(
    'a[href*="/views/sv"], [class*="empty" i], text=/No views|error|retry/i',
    { timeout: 30000 },
  );
} catch {
  console.log('wait timeout — dumping anyway');
}
await page.waitForTimeout(3000);
await shot('orvilo-views-dir3');
const info = await page.evaluate(() => ({
  url: location.href,
  links: [...document.querySelectorAll('a[href*="/views/"]')].map((a) => ({
    h: a.getAttribute('href'),
    t: a.innerText.trim().slice(0, 60),
  })),
  tableText: document.querySelector('table')?.innerText.slice(0, 1000) ?? 'NO TABLE',
  mainText: document.body.innerText.slice(0, 1200),
}));
fs.writeFileSync(`${OUT}/orvilo-dir3.json`, JSON.stringify(info, null, 2));
console.log('URL:', info.url);
console.log('LINKS:', JSON.stringify(info.links));
console.log('TABLE:', info.tableText.replaceAll('\n', ' | ').slice(0, 600));
await page.close();
await browser.close();
console.log('DONE');
