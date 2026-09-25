import { connect } from './lib.mjs';
const { browser, ctx, page } = await connect();
const reqs = [];
page.on('response', (r) => {
  const u = r.url();
  if (u.includes('trpc') || u.includes('webapi')) reqs.push(`${r.status()} ${u.slice(0, 140)}`);
});
page.on('pageerror', (e) => reqs.push(`[pageerror] ${String(e).slice(0, 250)}`));
await page
  .goto('http://localhost:3010/agent-testing/inbox', {
    waitUntil: 'domcontentloaded',
    timeout: 90000,
  })
  .catch((e) => console.log('goto err', e.message));
// poll DOM every 3s for up to 60s — report when sidebar text appears
for (let i = 0; i < 20; i++) {
  await page.waitForTimeout(3000);
  const state = await page
    .evaluate(() => ({
      url: location.href,
      text: document.body.innerText.replace(/\n{2,}/g, '|').slice(0, 200),
      hasAside: !!document.querySelector('aside, nav'),
      skeletons: document.querySelectorAll('[class*="skeleton"], [class*="Skeleton"]').length,
    }))
    .catch((e) => ({ err: e.message }));
  console.log(`t=${(i + 1) * 3}s`, JSON.stringify(state).slice(0, 400));
  if (state.hasAside && state.text && state.text.includes('Inbox')) break;
}
console.log('REQS:', JSON.stringify(reqs.slice(0, 40)));
await page.screenshot({ path: '/tmp/parity-inbox-evidence/orvilo-inbox-final.png' });
await page.close();
await browser.close();
