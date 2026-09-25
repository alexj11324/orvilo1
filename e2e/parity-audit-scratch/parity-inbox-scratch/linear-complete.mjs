import { connect } from './lib.mjs';
import fs from 'fs';
const EV = '/tmp/parity-inbox-evidence';
const { browser, page } = await connect();
const shot = (n) => page.screenshot({ path: `${EV}/${n}.png` });

await page
  .goto('https://linear.app/bdiverifier/inbox/priority', {
    waitUntil: 'domcontentloaded',
    timeout: 90000,
  })
  .catch((e) => console.log('goto err', e.message));
await page.waitForTimeout(12000);
console.log('URL:', page.url());
await shot('l-1-inbox');

// --- row full HTML (climb to row root) ---
const rowHTML = await page.evaluate(() => {
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
  while (
    el.parentElement &&
    el.parentElement.getBoundingClientRect().left <= 258 &&
    el.parentElement.getBoundingClientRect().height < 90
  )
    el = el.parentElement;
  // el now may be row or still inside; climb until parent is the list container (tall)
  while (
    el.parentElement &&
    el.parentElement.getBoundingClientRect().height < 100 &&
    el.parentElement !== document.body
  )
    el = el.parentElement;
  return el.outerHTML.slice(0, 9000);
});
if (rowHTML) fs.writeFileSync(`${EV}/l-row-full.html`, rowHTML);
console.log('ROW HTML saved:', rowHTML ? rowHTML.length : 'none');

// --- hover a row → capture hover actions ---
const box = await page.evaluate(() => {
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
  return { x: r.x + r.width * 0.6, y: r.y + r.height / 2 };
});
if (box) {
  await page.mouse.move(box.x, box.y);
  await page.waitForTimeout(1800);
  await shot('l-2-row-hover');
  const hov = await page.evaluate((y) => {
    const els = [
      ...document.querySelectorAll(
        'button, [role="button"], [role="option"], [role="checkbox"], a[href]',
      ),
    ].filter((el) => {
      const r = el.getBoundingClientRect();
      return (
        r.width > 0 &&
        r.height > 0 &&
        Math.abs(r.top + r.height / 2 - y) < 34 &&
        r.left > 250 &&
        r.left < 660
      );
    });
    return els.map((el) => ({
      tag: el.tagName,
      text: (el.innerText || '').trim().slice(0, 40),
      aria: el.getAttribute('aria-label'),
      title: el.getAttribute('title'),
      x: Math.round(el.getBoundingClientRect().x),
      w: Math.round(el.getBoundingClientRect().width),
    }));
  }, box.y);
  console.log('HOVER:', JSON.stringify(hov));
}

// --- Other tab ---
await page
  .goto('https://linear.app/bdiverifier/inbox/other', {
    waitUntil: 'domcontentloaded',
    timeout: 90000,
  })
  .catch(() => {});
await page.waitForTimeout(10000);
await shot('l-4-other');
const otherRows = await page.evaluate(() => {
  const t = document.body.innerText;
  return t.slice(0, 800);
});
console.log('OTHER TEXT:', otherRows.replace(/\n{2,}/g, '|'));

// --- keyboard: j/k selection hint? check aria-keyshortcuts on list ---
const keys = await page.evaluate(() =>
  [...document.querySelectorAll('[aria-keyshortcuts]')]
    .map((e) => e.getAttribute('aria-keyshortcuts'))
    .slice(0, 15),
);
console.log('KEYS:', JSON.stringify(keys));

await page.close();
await browser.close();
console.log('DONE');
