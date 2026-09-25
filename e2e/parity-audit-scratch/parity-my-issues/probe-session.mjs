import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
await page
  .goto('http://localhost:3010/agent-testing/my-issues', { waitUntil: 'commit', timeout: 45000 })
  .catch((e) => console.log('goto warn', e.message));
await page.waitForTimeout(10000);
console.log('URL:', page.url(), '| TITLE:', await page.title());
const txt = await page.evaluate(() => document.body.innerText.slice(0, 300));
console.log('BODY:', txt.replace(/\n/g, ' | ').slice(0, 300));
await page.close();
process.exit(0);
