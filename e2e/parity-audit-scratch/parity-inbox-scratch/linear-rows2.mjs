import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto('https://linear.app/bdiverifier/inbox/priority', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('text=unread notifications', { timeout: 20000 });
await page.waitForTimeout(2500);
// Find the element whose text is 'Devin mentioned you' and walk up to the row container
const html = await page.evaluate(() => {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node;
  let target = null;
  while ((node = walker.nextNode())) {
    if (node.nodeValue && node.nodeValue.includes('mentioned you')) {
      target = node.parentElement;
      break;
    }
  }
  if (!target) return 'NO TARGET';
  // walk up until element is >45px tall
  let el = target;
  while (el && el.getBoundingClientRect().height < 45) el = el.parentElement;
  return el ? el.outerHTML.slice(0, 4000) : 'NO ROW';
});
console.log(html);
await page.close();
await browser.close();
