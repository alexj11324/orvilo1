import { connect } from './_cdp.mjs';

const browser = await connect();
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => p.url().includes('linear.app'));
if (!page) {
  console.log('NO LINEAR TAB');
  process.exit(1);
}
await page.bringToFront();
await page.goto('https://linear.app/bdiverifier/my-issues/assigned', {
  waitUntil: 'domcontentloaded',
});
await page.waitForTimeout(7000);
console.log('URL:', page.url());

const btn = page.locator('[aria-label="Display options"]').first();
const count = await btn.count();
console.log('display-options buttons:', count);
if (count > 0) {
  await btn.click();
  await page.waitForTimeout(2500);
  // dump every visible popup-ish layer plus full body tail
  const dump = await page.evaluate(() => {
    const layers = [
      ...document.querySelectorAll(
        '[role="menu"], [role="listbox"], [role="dialog"], [class*="Popper"], [class*="popper"], [id*="popover"], [class*="Layer"]',
      ),
    ];
    const texts = layers
      .filter((el) => el.offsetParent !== null || el.getBoundingClientRect().height > 0)
      .map((el) => el.innerText)
      .filter(Boolean);
    return { layers: texts.join('\n====\n').slice(0, 5000) };
  });
  console.log(dump.layers || '(empty)');
  await page.screenshot({ path: '/tmp/linear-myissues-displayopts.png' });
  await page.keyboard.press('Escape');
}
