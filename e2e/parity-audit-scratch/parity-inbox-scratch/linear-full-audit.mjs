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
console.log('URL:', page.url());
await page.screenshot({ path: `${EV}/l-1-inbox.png` });

// --- 1. Row structure: full outerHTML of first row container ---
const rowData = await page.evaluate(() => {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node,
    target = null;
  while ((node = walker.nextNode())) {
    if (node.nodeValue && node.nodeValue.trim() === 'Devin mentioned you') {
      target = node.parentElement;
      break;
    }
  }
  if (!target) return { err: 'no target' };
  let el = target;
  // climb to the full row: the container that also holds the avatar (starts at panel left edge ~252)
  while (el && el.getBoundingClientRect().left > 258) el = el.parentElement;
  const r = el.getBoundingClientRect();
  return {
    rect: `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}`,
    html: el.outerHTML.slice(0, 6000),
  };
});
fs.writeFileSync(`${EV}/l-row.html`, rowData.html || JSON.stringify(rowData));
console.log('ROW:', rowData.rect || rowData.err);

// --- 2. Hover the first row → reveal hover actions ---
const rowBox = await page.evaluate(() => {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node,
    target = null;
  while ((node = walker.nextNode())) {
    if (node.nodeValue && node.nodeValue.trim() === 'Devin mentioned you') {
      target = node.parentElement;
      break;
    }
  }
  if (!target) return null;
  let el = target;
  while (el && el.getBoundingClientRect().left > 258) el = el.parentElement;
  const r = el.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
if (rowBox) {
  await page.mouse.move(rowBox.x, rowBox.y);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${EV}/l-2-row-hover.png` });
  const hov = await page.evaluate((y) => {
    const els = [
      ...document.querySelectorAll('button, [role="button"], [role="option"], a'),
    ].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && Math.abs(r.top + r.height / 2 - y) < 35 && r.left > 250;
    });
    return els.map((el) => ({
      text: (el.innerText || '').trim().slice(0, 40),
      aria: el.getAttribute('aria-label'),
      title: el.getAttribute('title'),
      x: Math.round(el.getBoundingClientRect().x),
    }));
  }, rowBox.y);
  console.log('HOVER:', JSON.stringify(hov));
}

// --- 3. Click a READ row (first "Marked as completed" row) → detail pane ---
const readRow = await page.evaluate(() => {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node,
    target = null;
  while ((node = walker.nextNode())) {
    if (node.nodeValue && node.nodeValue.includes('Marked as completed')) {
      target = node.parentElement;
      break;
    }
  }
  if (!target) return null;
  let el = target;
  while (el && el.getBoundingClientRect().left > 258) el = el.parentElement;
  const r = el.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2, h: r.height };
});
console.log('READ ROW:', JSON.stringify(readRow));
if (readRow) {
  await page.mouse.click(readRow.x, readRow.y);
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${EV}/l-3-detail.png` });
  console.log('detail URL:', page.url());
  // dump detail pane header controls
  const pane = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button, [role="button"], a')].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.left > 660 && r.top < 120;
    });
    return btns.map((el) => ({
      text: (el.innerText || '').trim().replace(/\n/g, '|').slice(0, 60),
      aria: el.getAttribute('aria-label'),
      title: el.getAttribute('title'),
      href: el.getAttribute('href'),
      x: Math.round(el.getBoundingClientRect().x),
      y: Math.round(el.getBoundingClientRect().y),
    }));
  });
  console.log('PANE HEADER:', JSON.stringify(pane, null, 1));
  // Escape to deselect
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1000);
}

// --- 4. Other tab ---
await page
  .goto('https://linear.app/bdiverifier/inbox/other', {
    waitUntil: 'domcontentloaded',
    timeout: 90000,
  })
  .catch(() => {});
await page.waitForTimeout(8000);
await page.screenshot({ path: `${EV}/l-4-other.png` });
const otherText = await page.evaluate(() =>
  document.body.innerText.replace(/\n{2,}/g, '|').slice(0, 600),
);
console.log('OTHER:', otherText);
await page.close();
await browser.close();
console.log('DONE');
