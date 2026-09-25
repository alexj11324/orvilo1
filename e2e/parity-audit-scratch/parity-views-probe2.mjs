import { chromium } from 'playwright';
import fs from 'node:fs';
const OUT = '/tmp/parity-views';
const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
page.setDefaultTimeout(60000);
const shot = async (n) => {
  await page.screenshot({ path: `${OUT}/${n}.png` });
  console.log('shot:', n);
};

await page.goto('https://linear.app/bdiverifier/views/issues', {
  waitUntil: 'domcontentloaded',
  timeout: 60000,
});
await page.waitForTimeout(5000);

// 1. Display options popover
try {
  await page.locator('main button[aria-label="Display options"]').first().click({ timeout: 10000 });
  await page.waitForTimeout(1200);
  await shot('linear-dir-displayoptions');
  const popText = await page.evaluate(() => {
    const pops = [
      ...document.querySelectorAll(
        '[role=dialog],[role=menu],[role=listbox],[data-radix-popper-content-wrapper]',
      ),
    ];
    return pops
      .map((p) => p.innerText)
      .filter(Boolean)
      .join('\n---\n')
      .slice(0, 4000);
  });
  fs.writeFileSync(`${OUT}/linear-dir-displayoptions.txt`, popText);
  console.log('POPOVER:', popText.slice(0, 1500));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
} catch (e) {
  console.log('display options FAIL:', e.message.slice(0, 200));
}

// 2. Hover the view row, find ⋯ button
try {
  const row = page.locator('main a[href*="/view/"]').first();
  await row.hover();
  await page.waitForTimeout(900);
  await shot('linear-dir-row-hover');
  const rowInfo = await page.evaluate(() => {
    const a = document.querySelector('main a[href*="/view/"]');
    if (!a) return 'no row';
    let container = a;
    for (let i = 0; i < 5 && container.parentElement; i++) container = container.parentElement;
    const btns = [...container.querySelectorAll('button')].map((b) => ({
      aria: b.getAttribute('aria-label'),
      text: b.innerText.trim().slice(0, 50),
    }));
    return { btns, rowText: a.innerText.slice(0, 200) };
  });
  fs.writeFileSync(`${OUT}/linear-dir-row.json`, JSON.stringify(rowInfo, null, 2));
  console.log('ROW:', JSON.stringify(rowInfo).slice(0, 1500));
} catch (e) {
  console.log('row FAIL:', e.message.slice(0, 200));
}

await page.close();
await browser.close();
console.log('DONE');
