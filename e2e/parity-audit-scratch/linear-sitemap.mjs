// Discover Linear URL map for BDI_Verifier workspace
import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const page = await ctx.newPage();

const urls = [
  'https://linear.app/bdiverifier/inbox',
  'https://linear.app/bdiverifier/my-issues',
  'https://linear.app/bdiverifier/views',
  'https://linear.app/bdiverifier/projects',
  'https://linear.app/bdiverifier/team/orvilo/all',
  'https://linear.app/bdiverifier/team/orvilo/triage',
  'https://linear.app/bdiverifier/team/orvilo/cycles',
];
for (const u of urls) {
  try {
    await page.goto(u, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(3500);
    console.log(u, '→', page.url(), '|', (await page.title()).slice(0, 60));
  } catch (e) {
    console.log(u, '→ ERR', e.message.split('\n')[0]);
  }
}
// team page to discover the real team key
await page.screenshot({ path: '/tmp/linear-probe-last.png' });
console.log('DONE');
process.exit(0);
