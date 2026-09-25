import { connect } from './lib.mjs';
const { browser, page } = await connect();
await page
  .goto('https://linear.app/bdiverifier/inbox/priority', {
    waitUntil: 'domcontentloaded',
    timeout: 90000,
  })
  .catch((e) => console.log('goto err', e.message));
await page.waitForTimeout(11000);
console.log('URL:', page.url());
// dump ancestors at a row point
const info = await page.evaluate(() => {
  const el = document.elementFromPoint(450, 232);
  if (!el) return 'none';
  const chain = [];
  let n = el;
  while (n && n !== document.body) {
    const r = n.getBoundingClientRect();
    chain.push(
      `${n.tagName}.${(n.className || '').toString().slice(0, 40)} role=${n.getAttribute('role')} href=${n.getAttribute('href')} rect=${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}`,
    );
    n = n.parentElement;
  }
  return chain.join('\n');
});
console.log('CHAIN:\n', info);
await page.close();
await browser.close();
