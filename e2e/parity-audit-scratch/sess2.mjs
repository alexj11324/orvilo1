import { chromium } from 'playwright';
const b = await chromium.connectOverCDP('http://localhost:9222');
const ctx = b.contexts()[0];
const p = await ctx.newPage();
await p.goto('http://localhost:3010/agent-testing/tasks', {
  waitUntil: 'domcontentloaded',
  timeout: 45000,
});
await p.waitForTimeout(6000);
console.log('ORVILO', p.url());
await p.goto('https://linear.app/bdiverifier/inbox', {
  waitUntil: 'domcontentloaded',
  timeout: 45000,
});
await p.waitForTimeout(6000);
console.log('LINEAR', p.url());
await p.close();
await b.close();
