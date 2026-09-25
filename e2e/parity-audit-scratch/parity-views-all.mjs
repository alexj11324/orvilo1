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
      '[role=menuitem],[role=option],[role=menuitemcheckbox],[role=menuitemradio],[role=radio],[role=checkbox]',
    )) {
      const r = el.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) continue;
      items.push({
        role: el.getAttribute('role'),
        text: (el.innerText || '').trim().slice(0, 80),
        x: Math.round(r.x),
        y: Math.round(r.y),
        checked: el.getAttribute('aria-checked'),
      });
    }
    const overlays = [
      ...document.querySelectorAll(
        '[role=menu],[role=dialog],[role=listbox],[data-radix-popper-content-wrapper],[data-side]',
      ),
    ]
      .map((o) => o.innerText.slice(0, 1500))
      .filter(Boolean);
    return { items, overlays };
  });
  fs.writeFileSync(`${OUT}/${name}.json`, JSON.stringify(data, null, 2));
  console.log(`--- ${name}: ${data.items.length} items`);
  for (const o of data.overlays) console.log('OVERLAY:', o.slice(0, 900).replaceAll('\n', ' | '));
};

// ============ PART A: Orvilo directory ============
await page.goto('http://localhost:3010/agent-testing/views', {
  waitUntil: 'domcontentloaded',
  timeout: 60000,
});
await page.waitForTimeout(8000);
const table = await page.evaluate(
  () => document.querySelector('table')?.outerHTML.slice(0, 9000) ?? 'NO TABLE',
);
fs.writeFileSync(`${OUT}/orvilo-dir-table.html`, table);
console.log('TABLE len:', table.length);
const links = await page.evaluate(() =>
  [...document.querySelectorAll('a[href*="/views/"]')].map((a) => ({
    href: a.getAttribute('href'),
    text: a.innerText.trim().slice(0, 60),
  })),
);
console.log('VIEW LINKS:', JSON.stringify(links));
await shot('orvilo-views-dir');

// Orvilo display options popover
try {
  await page.locator('button[aria-label="Display options"]').first().click({ timeout: 8000 });
  await page.waitForTimeout(1000);
  await shot('orvilo-dir-displayopts');
  await dumpOverlay('orvilo-dir-displayopts');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
} catch (e) {
  console.log('orvilo display FAIL', e.message.slice(0, 120));
}

// Orvilo New view modal (open + cancel)
try {
  await page.locator('button:has-text("New view")').first().click({ timeout: 8000 });
  await page.waitForTimeout(1500);
  await shot('orvilo-newview-modal');
  await dumpOverlay('orvilo-newview-modal');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
} catch (e) {
  console.log('orvilo newview FAIL', e.message.slice(0, 120));
}

// Orvilo view detail — seeded view
await page.goto('http://localhost:3010/agent-testing/views/svparityvol0001', {
  waitUntil: 'domcontentloaded',
  timeout: 60000,
});
await page.waitForTimeout(8000);
await shot('orvilo-view-detail');
const od = await page.evaluate(() => {
  const els = [];
  for (const el of document.querySelectorAll(
    'button, a[href], input, [role=tab], [role=button], [role=switch]',
  )) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && r.y < 220 && r.x > 230) {
      els.push({
        tag: el.tagName.toLowerCase(),
        aria: el.getAttribute('aria-label'),
        role: el.getAttribute('role'),
        title: el.getAttribute('title'),
        text: (el.innerText || '').trim().slice(0, 60),
        x: Math.round(r.x),
        y: Math.round(r.y),
        w: Math.round(r.width),
        h: Math.round(r.height),
      });
    }
  }
  return {
    url: location.href,
    title: document.title,
    bodyStart: document.body.innerText.slice(0, 600),
    els,
  };
});
fs.writeFileSync(`${OUT}/orvilo-view-detail-dom.json`, JSON.stringify(od, null, 2));
console.log('ORVILO DETAIL URL:', od.url, 'els:', od.els.length);
for (const e of od.els)
  console.log(
    `${e.tag} x=${e.x} y=${e.y} ${e.aria || e.title || e.role || ''} | ${e.text.slice(0, 50)}`,
  );

// Orvilo ⋯ menu
try {
  const menuBtn = page
    .locator('button[aria-label*="options" i], button[aria-label*="View options" i]')
    .last();
  await menuBtn.click({ timeout: 8000 });
  await page.waitForTimeout(1000);
  await shot('orvilo-view-menu');
  await dumpOverlay('orvilo-view-menu');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
} catch (e) {
  console.log('orvilo menu FAIL', e.message.slice(0, 120));
}

// Orvilo Add filter popover
try {
  await page
    .locator('button[aria-label*="filter" i], button[title*="filter" i]')
    .first()
    .click({ timeout: 8000 });
  await page.waitForTimeout(1200);
  await shot('orvilo-view-addfilter');
  await dumpOverlay('orvilo-view-addfilter');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
} catch (e) {
  console.log('orvilo filter FAIL', e.message.slice(0, 120));
}

// Orvilo Display options
try {
  await page
    .locator('button[aria-label="Display options"], button[title="Display options"]')
    .last()
    .click({ timeout: 8000 });
  await page.waitForTimeout(1200);
  await shot('orvilo-view-displayopts');
  await dumpOverlay('orvilo-view-displayopts');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
} catch (e) {
  console.log('orvilo disp FAIL', e.message.slice(0, 120));
}

await page.close();
await browser.close();
console.log('DONE-ALL');
