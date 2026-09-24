import fs from 'node:fs';
import { connect } from './_cdp.mjs';
const OUT = '/tmp/parity-views';
const browser = await connect(12);
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
page.setDefaultTimeout(45000);
const shot = async (n) => {
  await page.screenshot({ path: `${OUT}/${n}.png` });
  console.log('shot:', n);
};
const dumpOverlay = async (name) => {
  const data = await page.evaluate(() => {
    const items = [];
    for (const el of document.querySelectorAll(
      '[role=menuitem],[role=option],[role=menuitemcheckbox],[role=menuitemradio],[role=radio],[role=checkbox],[role=switch],[role=combobox]',
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
        '[role=menu],[role=dialog],[role=listbox],[data-radix-popper-content-wrapper],[class*=popover],[class*=Popover]',
      ),
    ]
      .map((o) => o.innerText.slice(0, 1800))
      .filter(Boolean);
    return { items, overlays };
  });
  fs.writeFileSync(`${OUT}/${name}.json`, JSON.stringify(data, null, 2));
  console.log(`--- ${name}: ${data.items.length} items, ${data.overlays.length} overlays`);
  for (const o of data.overlays.slice(0, 3))
    console.log('OVL:', o.slice(0, 800).replaceAll('\n', ' | '));
};

// ---- ensure Orvilo login ----
await page.goto('http://localhost:3010/agent-testing/views', {
  waitUntil: 'domcontentloaded',
  timeout: 60000,
});
await page.waitForTimeout(5000);
if (page.url().includes('/signin')) {
  console.log('signin bounce — logging in');
  const agree = page.getByRole('button', { name: /agree and continue/i });
  if (await agree.count()) {
    await agree.first().click();
    await page.waitForTimeout(1000);
  }
  const email = page
    .locator('input[type="text"], input[type="email"], input[placeholder*="email" i]')
    .first();
  await email.fill('agent-testing@orvilo.aspectlylabs.com');
  const cb = page.locator('input[type="checkbox"]').first();
  if (await cb.count()) await cb.check({ force: true }).catch(() => {});
  await page.getByRole('button', { name: /next/i }).first().click();
  await page.waitForTimeout(4000);
  const pwd = page.locator('input[type="password"]').first();
  await pwd.fill('TestPassword123!');
  await page
    .getByRole('button', { name: /sign in/i })
    .first()
    .click();
  await page.waitForTimeout(8000);
  console.log('after login:', page.url());
  await page.goto('http://localhost:3010/agent-testing/views', {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
}
// wait for real rows (a view link) or error/empty
try {
  await page.waitForSelector('a[href*="/views/sv"], text=/No views|match/i', { timeout: 30000 });
} catch {
  console.log('rows wait timeout');
}
await page.waitForTimeout(2500);
await shot('orvilo-views-dir');
const dir = await page.evaluate(() => ({
  url: location.href,
  links: [...document.querySelectorAll('a[href*="/views/"]')].map((a) => ({
    h: a.getAttribute('href'),
    t: a.innerText.trim().slice(0, 60),
  })),
  tableText: document.querySelector('table')?.innerText.slice(0, 1200) ?? 'NO TABLE',
}));
fs.writeFileSync(`${OUT}/orvilo-dir-final.json`, JSON.stringify(dir, null, 2));
console.log('DIR URL:', dir.url);
console.log('DIR LINKS:', JSON.stringify(dir.links));
console.log('DIR TABLE:', dir.tableText.replaceAll('\n', ' | ').slice(0, 700));

// directory row: hover first row, look for ⋯
try {
  const row = page.locator('tbody tr:not([data-list-section])').first();
  await row.hover();
  await page.waitForTimeout(800);
  await shot('orvilo-dir-row-hover');
  const rowBtns = await page.evaluate(() =>
    [...document.querySelectorAll('tbody tr:not([data-list-section])')].map((tr) => ({
      text: tr.innerText.slice(0, 80),
      btns: [...tr.querySelectorAll('button')].map(
        (b) => b.getAttribute('aria-label') || b.title || b.innerText.slice(0, 30),
      ),
    })),
  );
  console.log('ROW BTNS:', JSON.stringify(rowBtns));
  fs.writeFileSync(`${OUT}/orvilo-dir-rows.json`, JSON.stringify(rowBtns, null, 2));
} catch (e) {
  console.log('row hover FAIL', e.message.slice(0, 120));
}

// dir display options
try {
  await page.locator('button[aria-label="Display options"]').first().click({ timeout: 10000 });
  await page.waitForTimeout(1200);
  await shot('orvilo-dir-displayopts');
  await dumpOverlay('orvilo-dir-displayopts');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
} catch (e) {
  console.log('dir disp FAIL', e.message.slice(0, 120));
}

// dir New view modal
try {
  await page.locator('button:has-text("New view")').first().click({ timeout: 10000 });
  await page.waitForTimeout(1800);
  await shot('orvilo-newview-modal');
  await dumpOverlay('orvilo-newview-modal');
  // cancel via Escape
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);
} catch (e) {
  console.log('newview FAIL', e.message.slice(0, 120));
}

// ===== detail page =====
await page.goto('http://localhost:3010/agent-testing/views/svparityvol0001', {
  waitUntil: 'domcontentloaded',
  timeout: 60000,
});
await page.waitForTimeout(8000);
await shot('orvilo-view-detail');
const det = await page.evaluate(() => {
  const els = [];
  for (const el of document.querySelectorAll(
    'button, a[href], input, [role=tab], [role=button], [role=switch]',
  )) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && r.y < 200 && r.x > 230) {
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
  return { url: location.href, els };
});
fs.writeFileSync(`${OUT}/orvilo-view-detail-dom.json`, JSON.stringify(det, null, 2));
console.log('DETAIL URL:', det.url, 'els:', det.els.length);
for (const e of det.els)
  console.log(`${e.tag} x=${e.x} y=${e.y} ${e.aria || e.title || ''} | ${e.text.slice(0, 50)}`);

// detail ⋯ menu
try {
  await page.locator('button[aria-label="View options"]').first().click({ timeout: 10000 });
  await page.waitForTimeout(1200);
  await shot('orvilo-view-menu');
  await dumpOverlay('orvilo-view-menu');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
} catch (e) {
  console.log('menu FAIL', e.message.slice(0, 120));
}

// detail Add filter
try {
  await page
    .locator('button[aria-label="Add filter"], button[title="Add filter"]')
    .first()
    .click({ timeout: 10000 });
  await page.waitForTimeout(1400);
  await shot('orvilo-view-addfilter');
  await dumpOverlay('orvilo-view-addfilter');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
} catch (e) {
  console.log('filter FAIL', e.message.slice(0, 120));
}

// detail Display options
try {
  await page
    .locator('button[aria-label="Display options"], button[title="Display options"]')
    .last()
    .click({ timeout: 10000 });
  await page.waitForTimeout(1400);
  await shot('orvilo-view-displayopts');
  await dumpOverlay('orvilo-view-displayopts');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
} catch (e) {
  console.log('disp FAIL', e.message.slice(0, 120));
}

await page.close();
await browser.close();
console.log('DONE-FULL');
