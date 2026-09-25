import fs from 'node:fs';
import { connect } from './_cdp.mjs';
const OUT = '/tmp/parity-views';
const browser = await connect();
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
page.setDefaultTimeout(60000);
const shot = async (n) => {
  await page.screenshot({ path: `${OUT}/${n}.png` });
  console.log('shot:', n);
};

await page.goto('https://linear.app/bdiverifier/view/all-issues-3320169ce6ab', {
  waitUntil: 'domcontentloaded',
  timeout: 60000,
});
await page.waitForTimeout(7000);

const dumpOverlay = async (name) => {
  const data = await page.evaluate(() => {
    const items = [];
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) continue;
      const s = getComputedStyle(el);
      if (s.position !== 'fixed' && s.position !== 'absolute') continue;
      const role = el.getAttribute('role');
      const text = (el.innerText || '').trim();
      // capture menu items specifically
      if (
        role === 'menuitem' ||
        role === 'option' ||
        role === 'menuitemcheckbox' ||
        role === 'menuitemradio'
      ) {
        items.push({ role, text: text.slice(0, 80), x: Math.round(r.x), y: Math.round(r.y) });
      }
    }
    // also capture overlay container text
    const overlays = [
      ...document.querySelectorAll(
        '[role=menu],[role=dialog],[role=listbox],[data-radix-popper-content-wrapper]',
      ),
    ].map((o) => ({
      cls: (o.className || '').toString().slice(0, 50),
      text: o.innerText.slice(0, 1200),
    }));
    return { items, overlays };
  });
  fs.writeFileSync(`${OUT}/${name}.json`, JSON.stringify(data, null, 2));
  console.log(`--- ${name}: ${data.items.length} items, ${data.overlays.length} overlays`);
  for (const o of data.overlays)
    console.log('OVERLAY:', o.text.slice(0, 800).replaceAll('\n', ' | '));
};

// 1. Issue view options ⋯ menu
try {
  await page.locator('button[aria-label="Issue view options"]').first().click({ timeout: 10000 });
  await page.waitForTimeout(1200);
  await shot('linear-view-menu');
  await dumpOverlay('linear-view-menu');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(700);
} catch (e) {
  console.log('menu FAIL', e.message.slice(0, 150));
}

// 2. Add filter
try {
  await page
    .locator('main button[aria-label="Add filter"], button:has-text("Add filter")')
    .first()
    .click({ timeout: 10000 });
  await page.waitForTimeout(1200);
  await shot('linear-view-addfilter');
  await dumpOverlay('linear-view-addfilter');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(700);
} catch (e) {
  console.log('filter FAIL', e.message.slice(0, 150));
}

// 3. Display options
try {
  await page.locator('main button[aria-label="Display options"]').first().click({ timeout: 10000 });
  await page.waitForTimeout(1200);
  await shot('linear-view-displayopts');
  await dumpOverlay('linear-view-displayopts');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(700);
} catch (e) {
  console.log('display FAIL', e.message.slice(0, 150));
}

await page.close();
await browser.close();
console.log('DONE');
