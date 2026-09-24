import { connect } from './lib.mjs';
const { browser, page } = await connect();
await page
  .goto('https://linear.app/bdiverifier/inbox/priority', {
    waitUntil: 'domcontentloaded',
    timeout: 90000,
  })
  .catch((e) => console.log('goto err', e.message));
await page.waitForTimeout(11000);
// find first row element: an element in list area that is a link or has role
const rowInfo = await page.evaluate(() => {
  // Linear rows: look for elements with class containing 'sx-' that wrap both avatar and text, ~55px tall
  const cands = [...document.querySelectorAll('a[href*="inbox"], [role="link"], li')];
  const rows = cands.filter((el) => {
    const r = el.getBoundingClientRect();
    return r.left > 245 && r.left < 660 && r.top > 200 && r.height > 40 && r.height < 90;
  });
  return {
    count: rows.length,
    sample: rows
      .slice(0, 3)
      .map((el) => ({
        tag: el.tagName,
        href: el.getAttribute('href'),
        y: Math.round(el.getBoundingClientRect().y),
      })),
  };
});
console.log('ROWINFO:', JSON.stringify(rowInfo));
// fallback: get any element at a known row position
const at = await page.evaluate(() => {
  const el = document.elementFromPoint(450, 232);
  if (!el) return 'none';
  let row = el;
  while (
    row &&
    !(
      row.getBoundingClientRect().height >= 45 &&
      row.getBoundingClientRect().height <= 75 &&
      row.getBoundingClientRect().left <= 260
    )
  )
    row = row.parentElement;
  return row ? row.outerHTML.slice(0, 5000) : 'no row at point';
});
console.log('ATPOINT:', at);
await page.close();
await browser.close();
