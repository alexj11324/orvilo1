import { connect } from './lib.mjs';
import fs from 'fs';
const { browser, page } = await connect();
const EV = '/tmp/parity-inbox-evidence';
await page
  .goto('https://linear.app/bdiverifier/inbox/priority', {
    waitUntil: 'domcontentloaded',
    timeout: 90000,
  })
  .catch((e) => console.log('goto err', e.message));
await page.waitForTimeout(12000);
// locate a row via the actor-action text (" mentioned you" text node)
const rowBox = await page.evaluate(() => {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node,
    target = null;
  while ((node = walker.nextNode())) {
    if (node.nodeValue && node.nodeValue.includes('mentioned you')) {
      target = node.parentElement;
      break;
    }
  }
  if (!target) return null;
  let el = target;
  while (el && el.getBoundingClientRect().left > 258) el = el.parentElement;
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return {
    x: r.x + r.width / 2,
    y: r.y + r.height / 2,
    rect: `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}`,
    html: el.outerHTML,
  };
});
if (!rowBox) {
  console.log('NO ROW');
  await page.close();
  await browser.close();
  process.exit(0);
}
console.log('ROWRECT:', rowBox.rect);
fs.writeFileSync(`${EV}/l-row-full.html`, rowBox.html.slice(0, 9000));
// hover → reveal hover actions
await page.mouse.move(rowBox.x, rowBox.y);
await page.waitForTimeout(1600);
await page.screenshot({ path: `${EV}/l-2-row-hover.png` });
const hov = await page.evaluate((y) => {
  const els = [
    ...document.querySelectorAll('button, [role="button"], [role="option"], [role="checkbox"], a'),
  ].filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && Math.abs(r.top + r.height / 2 - y) < 34 && r.left > 250;
  });
  return els.map((el) => ({
    tag: el.tagName,
    text: (el.innerText || '').trim().slice(0, 50),
    aria: el.getAttribute('aria-label'),
    title: el.getAttribute('title'),
    x: Math.round(el.getBoundingClientRect().x),
    w: Math.round(el.getBoundingClientRect().width),
  }));
}, rowBox.y);
console.log('HOVER:', JSON.stringify(hov, null, 1));
// also capture aria-keyshortcuts / kbd hints on row
const kbd = await page.evaluate(() =>
  [...document.querySelectorAll('kbd, [aria-keyshortcuts]')]
    .map((el) => ({ t: (el.innerText || '').trim(), ks: el.getAttribute('aria-keyshortcuts') }))
    .slice(0, 20),
);
console.log('KBD:', JSON.stringify(kbd));
await page.close();
await browser.close();
console.log('DONE');
