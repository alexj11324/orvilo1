import { chromium } from 'playwright';
const b = await chromium.connectOverCDP('http://localhost:9222', { timeout: 60000 });
const ctx = b.contexts()[0];
const lin = ctx.pages().find((p) => p.url().includes('linear.app'));
console.log('linear tab:', lin?.url().slice(0, 70));
const title = await lin
  .evaluate(() => document.title)
  .catch((e) => 'ERR ' + e.message.slice(0, 60));
console.log('title:', title);
const orv = ctx.pages().find((p) => p.url().includes('localhost:3010'));
console.log('orvilo tab:', orv?.url().slice(0, 70));
await b.close();
