import fs from 'node:fs';
import { connect } from './_cdp.mjs';
const OUT = '/tmp/parity-views';
const browser = await connect(10);
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
page.setDefaultTimeout(60000);
const shot = async (n) => {
  await page.screenshot({ path: `${OUT}/${n}.png` });
  console.log('shot:', n);
};
const dumpOverlay = async (name) => {
  const data = await page.evaluate(() => {
    const items = [];
    for (const el of document.querySelectorAll(
      '[role=menuitem],[role=option],[role=menuitemcheckbox],[role=menuitemradio],[role=radio],[role=checkbox],[role=switch]',
    )) {
      const r = el.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) continue;
      items.push({
        role: el.getAttribute('role'),
        text: (el.innerText || '').trim().slice(0, 90),
        checked: el.getAttribute('aria-checked'),
        x: Math.round(r.x),
        y: Math.round(r.y),
      });
    }
    const overlays = [
      ...document.querySelectorAll(
        '[role=menu],[role=dialog],[role=listbox],[data-radix-popper-content-wrapper]',
      ),
    ]
      .map((o) => o.innerText.slice(0, 1800))
      .filter(Boolean);
    return { items, overlays };
  });
  fs.writeFileSync(`${OUT}/${name}.json`, JSON.stringify(data, null, 2));
  console.log(`--- ${name}: ${data.items.length} items, ${data.overlays.length} overlays`);
  for (const o of data.overlays) console.log('OVERLAY:', o.slice(0, 1000).replaceAll('\n', ' | '));
};

await page.goto('https://linear.app/bdiverifier/view/all-issues-3320169ce6ab', {
  waitUntil: 'domcontentloaded',
  timeout: 60000,
});
await page.waitForTimeout(7000);

// 1. Issue view options ⋯ menu
try {
  await page.locator('button[aria-label="Issue view options"]').first().click({ timeout: 15000 });
  await page.waitForTimeout(1400);
  await shot('linear-view-menu');
  await dumpOverlay('linear-view-menu');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(700);
} catch (e) {
  console.log('menu FAIL', e.message.slice(0, 150));
}

// 2. Add filter
try {
  await page.locator('button[aria-label="Add filter"]').first().click({ timeout: 15000 });
  await page.waitForTimeout(1400);
  await shot('linear-view-addfilter');
  await dumpOverlay('linear-view-addfilter');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(700);
} catch (e) {
  console.log('filter FAIL', e.message.slice(0, 150));
}

// 3. Display options
try {
  await page.locator('button[aria-label="Display options"]').first().click({ timeout: 15000 });
  await page.waitForTimeout(1400);
  await shot('linear-view-displayopts');
  await dumpOverlay('linear-view-displayopts');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(700);
} catch (e) {
  console.log('display FAIL', e.message.slice(0, 150));
}

// 4. Details pane: Open menu (the pane's own ⋯)
try {
  await page
    .locator('aside button[aria-label="Open menu"], button[aria-label="Open menu"]')
    .first()
    .click({ timeout: 10000 });
  await page.waitForTimeout(1200);
  await shot('linear-view-panemenu');
  await dumpOverlay('linear-view-panemenu');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
} catch (e) {
  console.log('pane menu FAIL', e.message.slice(0, 150));
}

// 5. details pane facet tabs + structure
const pane = await page.evaluate(() => {
  const aside = document.querySelector('aside');
  return aside ? aside.innerText.slice(0, 2500) : 'NO ASIDE';
});
fs.writeFileSync(`${OUT}/linear-view-pane.txt`, pane);
console.log('PANE:', pane.slice(0, 900).replaceAll('\n', ' | '));

// 6. title area — is it editable? dump header elements
const header = await page.evaluate(() => {
  const els = [];
  for (const el of document.querySelectorAll(
    'h1, h2, [contenteditable], input[type=text], header *, main > div:first-child *',
  )) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && r.y < 55 && r.x > 240) {
      els.push({
        tag: el.tagName.toLowerCase(),
        ce: el.getAttribute('contenteditable'),
        text: (el.innerText || el.value || '').trim().slice(0, 60),
        x: Math.round(r.x),
        w: Math.round(r.width),
      });
    }
  }
  return els.slice(0, 30);
});
fs.writeFileSync(`${OUT}/linear-view-header.json`, JSON.stringify(header, null, 2));
console.log('HEADER:', JSON.stringify(header).slice(0, 1200));

await page.close();
await browser.close();
console.log('DONE-L2');
