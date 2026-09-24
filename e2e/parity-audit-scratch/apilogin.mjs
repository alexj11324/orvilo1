import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://localhost:9222', { timeout: 120000 });
const ctx = browser.contexts()[0];
let page = ctx.pages().find((p) => p.url().includes('localhost:3010')) || (await ctx.newPage());
await page.goto('http://localhost:3010/signin', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);
// try better-auth email sign-in directly
const res = await page.evaluate(async () => {
  const r = await fetch('/api/auth/sign-in/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'agent-testing@orvilo.aspectlylabs.com',
      password: 'TestPassword123!',
    }),
  });
  return { status: r.status, body: (await r.text()).slice(0, 300) };
});
console.log('signin api:', JSON.stringify(res));
await page.waitForTimeout(2000);
await page.goto('http://localhost:3010/agent-testing/tasks', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(6000);
console.log('FINAL:', page.url());
await page.screenshot({ path: '/tmp/orvilo-after-api.png' });
process.exit(0);
