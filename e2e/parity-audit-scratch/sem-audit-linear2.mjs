import { connect } from './_cdp.mjs';

const browser = await connect();
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => p.url().includes('linear.app'));
if (!page) {
  console.log('NO LINEAR TAB');
  process.exit(1);
}
await page.bringToFront();
await page.waitForTimeout(3000);
console.log('URL:', page.url());
const text = await page.evaluate(() => {
  const main = document.querySelector('main') || document.body;
  return main.innerText.slice(0, 6000);
});
console.log(text);
