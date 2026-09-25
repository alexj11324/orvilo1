import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://localhost:9222');
console.log('contexts:', browser.contexts().length);
for (const ctx of browser.contexts()) {
  const cookies = await ctx.cookies();
  const local = cookies.filter((c) => c.domain.includes('localhost') || c.domain.includes('127.'));
  console.log(
    'ctx pages:',
    ctx.pages().length,
    'localhost cookies:',
    local.map((c) => `${c.name}@${c.domain}`),
  );
  console.log(
    '  urls:',
    ctx.pages().map((p) => p.url().slice(0, 80)),
  );
}
await browser.close();
