import { connect } from './lib.mjs';
const { browser, page } = await connect();
await page
  .goto('https://linear.app/bdiverifier/inbox/priority', {
    waitUntil: 'domcontentloaded',
    timeout: 90000,
  })
  .catch((e) => console.log('goto err', e.message));
await page.waitForTimeout(12000);
console.log('URL:', page.url());
const html = await page.evaluate(() => {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node,
    target = null;
  while ((node = walker.nextNode())) {
    if (node.nodeValue && node.nodeValue.includes('mentioned you')) {
      target = node.parentElement;
      break;
    }
  }
  if (!target) return 'NO TARGET';
  let el = target;
  while (el && el.getBoundingClientRect().height < 45) el = el.parentElement;
  return el ? el.outerHTML.slice(0, 4500) : 'NO ROW';
});
console.log('ROWHTML:', html);
await page.close();
await browser.close();
