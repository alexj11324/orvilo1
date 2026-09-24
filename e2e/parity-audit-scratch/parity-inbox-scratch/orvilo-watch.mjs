import { connect } from './lib.mjs';
const { browser, page } = await connect();
const reqs = [];
page.on('response', (r) => {
  const u = r.url();
  if (u.includes('notification') || u.includes('inbox'))
    reqs.push(`${r.status()} ${u.slice(0, 150)}`);
});
await page
  .goto('http://localhost:3010/agent-testing/inbox', {
    waitUntil: 'domcontentloaded',
    timeout: 90000,
  })
  .catch((e) => console.log('goto err', e.message));
await page.waitForTimeout(20000);
console.log('URL:', page.url());
console.log('FEED REQS:', JSON.stringify(reqs, null, 1));
await page.screenshot({ path: '/tmp/parity-inbox-evidence/orvilo-inbox-loaded.png' });
const txt = await page
  .evaluate(() => document.body.innerText.replace(/\n{2,}/g, '\n').slice(0, 1500))
  .catch(() => '');
console.log('TEXT:', txt);
await page.close();
await browser.close();
