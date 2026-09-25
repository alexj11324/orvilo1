// Probe: verify Linear + Orvilo sessions in CDP Chrome
import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];

// Linear tab
const linear = await ctx.newPage();
await linear.goto('https://linear.app/bdiverifier', { waitUntil: 'domcontentloaded' });
await linear.waitForTimeout(6000);
console.log('LINEAR URL:', linear.url());
await linear.screenshot({ path: '/tmp/probe-linear.png' });

// Orvilo tab
const orvilo = await ctx.newPage();
await orvilo.goto('http://localhost:3010/agent-testing/tasks', { waitUntil: 'domcontentloaded' });
await orvilo.waitForTimeout(6000);
console.log('ORVILO URL:', orvilo.url());
await orvilo.screenshot({ path: '/tmp/probe-orvilo.png' });

console.log('DONE');
process.exit(0);
