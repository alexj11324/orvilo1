import { connect } from './_cdp.mjs';

// One Linear tab, reused. Audit: does My Issues > Assigned show triage issues?
// And what does Linear's triage Accept/Decline do to status?
const browser = await connect();
const ctx = browser.contexts()[0];
let page = ctx.pages().find((p) => p.url().includes('linear.app'));
if (!page) page = await ctx.newPage();
await page.bringToFront();

await page.goto('https://linear.app/bdiverifier/my-issues/assigned', {
  waitUntil: 'domcontentloaded',
});
await page.waitForTimeout(6000);
const url1 = page.url();
// Extract visible section headers + a few row identifiers
const text1 = await page.evaluate(() => {
  const main = document.querySelector('main') || document.body;
  return main.innerText.slice(0, 4000);
});
console.log('=== MY ISSUES URL:', url1);
console.log(text1);
