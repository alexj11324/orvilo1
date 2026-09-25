import { chromium } from 'playwright';
import fs from 'fs';
const browser = await chromium.connectOverCDP('http://localhost:9222', { timeout: 90000 });
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
const log = [];
try {
  await page.goto('http://localhost:3010/agent-testing/project/prj_Pfyw7IcIBtsO', {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForTimeout(8000);
  log.push('url: ' + page.url());
  log.push('text: ' + (await page.evaluate(() => document.body.innerText.slice(0, 200))));
  const cookies = await ctx.cookies('http://localhost:3010');
  log.push(
    'cookies: ' +
      JSON.stringify(cookies.map((c) => ({ name: c.name, domain: c.domain, path: c.path }))),
  );
} catch (e) {
  log.push('ERR ' + e.message);
}
fs.writeFileSync('/tmp/parity-project-detail/auth-check.log', log.join('\n'));
await page.screenshot({ path: '/tmp/parity-project-detail/auth-check.png' });
process.exit(0);
