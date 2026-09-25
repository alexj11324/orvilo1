import { connect } from './_cdp.mjs';

const browser = await connect();
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => p.url().includes('linear.app'));
if (!page) {
  console.log('NO LINEAR TAB');
  process.exit(1);
}
await page.bringToFront();
console.log('URL:', page.url());

// Find the view/display options control on My Issues
const candidates = await page.evaluate(() => {
  const els = [...document.querySelectorAll('button, [role="button"]')];
  return els
    .map((el) => ({
      aria: el.getAttribute('aria-label') || '',
      title: el.getAttribute('title') || '',
      text: (el.innerText || '').trim().slice(0, 60),
    }))
    .filter((e) => /option|display|view|customi|layout/i.test(e.aria + e.title + e.text));
});
console.log(JSON.stringify(candidates, null, 1));
