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

const btn = page.locator('[aria-label="Display options"]').first();
await btn.click();
await page.waitForTimeout(1500);
const menuText = await page.evaluate(() => {
  const menus = [
    ...document.querySelectorAll(
      '[role="menu"], [role="dialog"], [data-radix-popper-content-wrapper], [class*="popover" i], [class*="Popover"]',
    ),
  ];
  return menus
    .map((m) => m.innerText)
    .filter(Boolean)
    .join('\n---MENU---\n')
    .slice(0, 4000);
});
console.log(menuText || '(no menu text)');
await page.keyboard.press('Escape');
