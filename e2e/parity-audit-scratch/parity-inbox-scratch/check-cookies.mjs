import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const cookies = await ctx.cookies('http://localhost:3010');
console.log(
  'COOKIES:',
  JSON.stringify(
    cookies.map((c) => ({ name: c.name, domain: c.domain, exp: c.expires })),
    null,
    1,
  ),
);
await browser.close();
