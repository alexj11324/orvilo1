import { connect } from './cdp-connect.mjs';
import fs from 'fs';
const browser = await connect();
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
const out = {};
try {
  const cookies = await ctx.cookies('http://localhost:3010');
  out.cookies = cookies.map((c) => ({
    name: c.name,
    expires: c.expires,
    domain: c.domain,
    httpOnly: c.httpOnly,
  }));
  await page.goto('http://localhost:3010/agent-testing/settings/labs', {
    waitUntil: 'domcontentloaded',
  });
  // watch for redirect for 20s
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(2000);
    const u = page.url();
    if (u.includes('/signin')) {
      out.bouncedAt = i * 2;
      break;
    }
    const t = await page.evaluate(() => document.body.innerText.slice(0, 300));
    if (t.includes('Labs') || t.includes('Experiment') || t.includes('lab')) {
      out.readyAt = i * 2;
      break;
    }
  }
  out.url = page.url();
  out.text = (await page.evaluate(() => document.body.innerText)).slice(0, 1200);
  await page.screenshot({ path: '/tmp/parity-project-detail/labs-page.png' });
} catch (e) {
  out.err = e.message;
}
fs.writeFileSync('/tmp/parity-project-detail/auth-state.json', JSON.stringify(out, null, 1));
process.exit(0);
