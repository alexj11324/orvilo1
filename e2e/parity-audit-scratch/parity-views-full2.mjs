import fs from 'node:fs';
import { connectPatient } from './_cdp-patient.mjs';
const OUT = '/tmp/parity-views';
const browser = await connectPatient(30);
console.log('CONNECTED');
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
  for (const o of data.overlays.slice(0, 3))
    console.log('OVL:', o.slice(0, 900).replaceAll('\n', ' | '));
};

// ==== LINEAR side ====
await page.goto('https://linear.app/bdiverifier/views/issues', {
  waitUntil: 'domcontentloaded',
  timeout: 60000,
});
await page.waitForSelector('a[href*="/view/"], main', { timeout: 40000 }).catch(() => {});
await page.waitForTimeout(5000);
await shot('linear-views-dir');
// full text of main content for section labels
const dirText = await page.evaluate(() => {
  const main = document.querySelector('main') || document.body;
  return main.innerText.slice(0, 2000);
});
fs.writeFileSync(`${OUT}/linear-dir-text.txt`, dirText);
console.log('DIR TEXT:', dirText.slice(0, 700).replaceAll('\n', ' | '));

// click Name header — does it sort?
try {
  const before = await page.evaluate(() =>
    document.querySelector('a[href*="/view/"]')?.innerText.slice(0, 40),
  );
  await page
    .locator('button[aria-label="Order by Name"], button:has-text("Name")')
    .first()
    .click({ timeout: 8000 });
  await page.waitForTimeout(1200);
  const after = await page.evaluate(() =>
    document.querySelector('a[href*="/view/"]')?.innerText.slice(0, 40),
  );
  console.log('NAME SORT: before=', before, 'after=', after);
} catch (e) {
  console.log('name sort FAIL', e.message.slice(0, 100));
}

// row hover → look for ⋯ menu
try {
  const row = page.locator('main a[href*="/view/"]').first();
  await row.hover();
  await page.waitForTimeout(900);
  await shot('linear-dir-row-hover2');
  const rowCtx = await page.evaluate(() => {
    const a = document.querySelector('main a[href*="/view/"]');
    let c = a;
    for (let i = 0; i < 6 && c?.parentElement; i++) c = c.parentElement;
    return { html: c?.innerHTML.slice(0, 2500) };
  });
  fs.writeFileSync(`${OUT}/linear-dir-rowctx.html`, rowCtx.html || 'none');
} catch (e) {
  console.log('row FAIL', e.message.slice(0, 100));
}

// right-click the row for context menu
try {
  const row = page.locator('main a[href*="/view/"]').first();
  await row.click({ button: 'right', timeout: 8000 });
  await page.waitForTimeout(1200);
  await shot('linear-dir-row-ctxmenu');
  await dumpOverlay('linear-dir-row-ctxmenu');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
} catch (e) {
  console.log('ctxmenu FAIL', e.message.slice(0, 100));
}

// New view button — where does it go?
try {
  await page
    .locator('button[aria-label="Create new view"], button:has-text("New view")')
    .first()
    .click({ timeout: 10000 });
  await page.waitForTimeout(2500);
  console.log('after New view click URL:', page.url());
  await shot('linear-newview');
  await dumpOverlay('linear-newview');
  // cancel/back — Escape or navigate back
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);
  if (!page.url().includes('/views/issues')) await page.goBack();
  await page.waitForTimeout(1500);
} catch (e) {
  console.log('newview FAIL', e.message.slice(0, 100));
}

// projects tab
try {
  await page.goto('https://linear.app/bdiverifier/views/issues', {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await page.waitForTimeout(4000);
  await page
    .locator('main a:has-text("Projects"), a[href="/bdiverifier/views/projects"]')
    .first()
    .click({ timeout: 10000 });
  await page.waitForTimeout(3000);
  console.log('projects tab URL:', page.url());
  await shot('linear-views-dir-projects');
  const pt = await page.evaluate(() =>
    (document.querySelector('main') || document.body).innerText.slice(0, 1500),
  );
  fs.writeFileSync(`${OUT}/linear-dir-projects.txt`, pt);
  console.log('PROJ:', pt.slice(0, 400).replaceAll('\n', ' | '));
} catch (e) {
  console.log('projects FAIL', e.message.slice(0, 100));
}

// team views page
await page.goto('https://linear.app/bdiverifier/team/ORV/views/issues', {
  waitUntil: 'domcontentloaded',
  timeout: 60000,
});
await page.waitForTimeout(6000);
await shot('linear-team-views');
const tv = await page.evaluate(() =>
  (document.querySelector('main') || document.body).innerText.slice(0, 1500),
);
fs.writeFileSync(`${OUT}/linear-team-views.txt`, tv);
console.log('TEAM VIEWS:', tv.slice(0, 500).replaceAll('\n', ' | '));

// ==== view detail: menus ====
await page.goto('https://linear.app/bdiverifier/view/all-issues-3320169ce6ab', {
  waitUntil: 'domcontentloaded',
  timeout: 60000,
});
await page.waitForTimeout(7000);
await shot('linear-view-detail2');
// title editable?
const titleInfo = await page.evaluate(() => {
  const els = [];
  for (const el of document.querySelectorAll(
    '[contenteditable], input[type=text], h1, h2, [role=heading]',
  )) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.y < 60)
      els.push({
        tag: el.tagName,
        ce: el.getAttribute('contenteditable'),
        text: (el.innerText || '').slice(0, 50),
        x: Math.round(r.x),
      });
  }
  return els;
});
console.log('TITLE ELS:', JSON.stringify(titleInfo));

try {
  await page.locator('button[aria-label="Issue view options"]').first().click({ timeout: 12000 });
  await page.waitForTimeout(1500);
  await shot('linear-view-menu');
  await dumpOverlay('linear-view-menu');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(700);
} catch (e) {
  console.log('menu FAIL', e.message.slice(0, 120));
}
try {
  await page.locator('button[aria-label="Add filter"]').first().click({ timeout: 12000 });
  await page.waitForTimeout(1500);
  await shot('linear-view-addfilter');
  await dumpOverlay('linear-view-addfilter');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(700);
} catch (e) {
  console.log('filter FAIL', e.message.slice(0, 120));
}
try {
  await page.locator('button[aria-label="Display options"]').first().click({ timeout: 12000 });
  await page.waitForTimeout(1500);
  await shot('linear-view-displayopts');
  await dumpOverlay('linear-view-displayopts');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(700);
} catch (e) {
  console.log('display FAIL', e.message.slice(0, 120));
}
try {
  await page.locator('aside button[aria-label="Open menu"]').first().click({ timeout: 8000 });
  await page.waitForTimeout(1200);
  await shot('linear-pane-menu');
  await dumpOverlay('linear-pane-menu');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
} catch (e) {
  console.log('pane menu FAIL', e.message.slice(0, 120));
}
const pane = await page.evaluate(
  () => document.querySelector('aside')?.innerText.slice(0, 2500) ?? 'NO ASIDE',
);
fs.writeFileSync(`${OUT}/linear-view-pane.txt`, pane);
console.log('PANE:', pane.slice(0, 800).replaceAll('\n', ' | '));

// ==== ORVILO side ====
await page.goto('http://localhost:3010/agent-testing/views', {
  waitUntil: 'domcontentloaded',
  timeout: 60000,
});
await page.waitForTimeout(6000);
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
  await page.locator('input[type="password"]').first().fill('TestPassword123!');
  await page
    .getByRole('button', { name: /sign in/i })
    .first()
    .click();
  await page.waitForTimeout(8000);
  await page.goto('http://localhost:3010/agent-testing/views', {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
}
try {
  await page.waitForSelector('a[href*="/views/sv"], text=/No views|match/i', { timeout: 30000 });
} catch {
  console.log('rows wait timeout');
}
await page.waitForTimeout(2500);
await shot('orvilo-views-dir');
const dir2 = await page.evaluate(() => ({
  url: location.href,
  links: [...document.querySelectorAll('a[href*="/views/"]')].map((a) => ({
    h: a.getAttribute('href'),
    t: a.innerText.trim().slice(0, 60),
  })),
  tableText: document.querySelector('table')?.innerText.slice(0, 1200) ?? 'NO TABLE',
  mainText: (document.querySelector('main') || document.body).innerText.slice(0, 1500),
}));
fs.writeFileSync(`${OUT}/orvilo-dir-final.json`, JSON.stringify(dir2, null, 2));
console.log('ORV DIR:', dir2.url, JSON.stringify(dir2.links));
console.log('ORV TABLE:', dir2.tableText.replaceAll('\n', ' | ').slice(0, 600));

// orvilo row hover → ⋯?
try {
  const row = page.locator('tbody tr:not([data-list-section])').first();
  await row.hover();
  await page.waitForTimeout(900);
  await shot('orvilo-dir-row-hover');
  const rowBtns = await page.evaluate(() =>
    [...document.querySelectorAll('tbody tr:not([data-list-section])')].map((tr) => ({
      text: tr.innerText.slice(0, 70),
      btns: [...tr.querySelectorAll('button')].map(
        (b) => b.getAttribute('aria-label') || b.title || '',
      ),
    })),
  );
  console.log('ORV ROW BTNS:', JSON.stringify(rowBtns));
} catch (e) {
  console.log('orv row FAIL', e.message.slice(0, 100));
}
// orvilo dir display options
try {
  await page.locator('button[aria-label="Display options"]').first().click({ timeout: 10000 });
  await page.waitForTimeout(1200);
  await shot('orvilo-dir-displayopts');
  await dumpOverlay('orvilo-dir-displayopts');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
} catch (e) {
  console.log('orv disp FAIL', e.message.slice(0, 100));
}
// orvilo New view modal
try {
  await page.locator('button:has-text("New view")').first().click({ timeout: 10000 });
  await page.waitForTimeout(1800);
  await shot('orvilo-newview-modal');
  await dumpOverlay('orvilo-newview-modal');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);
} catch (e) {
  console.log('orv newview FAIL', e.message.slice(0, 100));
}

// orvilo detail
await page.goto('http://localhost:3010/agent-testing/views/svparityvol0001', {
  waitUntil: 'domcontentloaded',
  timeout: 60000,
});
await page.waitForTimeout(8000);
await shot('orvilo-view-detail');
const od = await page.evaluate(() => {
  const els = [];
  for (const el of document.querySelectorAll('button, a[href], input, [role=tab], [role=button]')) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && r.y < 200 && r.x > 230)
      els.push({
        tag: el.tagName.toLowerCase(),
        aria: el.getAttribute('aria-label'),
        title: el.getAttribute('title'),
        text: (el.innerText || '').trim().slice(0, 60),
        x: Math.round(r.x),
        y: Math.round(r.y),
        w: Math.round(r.width),
        h: Math.round(r.height),
      });
  }
  const aside = document.querySelector('aside');
  return { url: location.href, els, asideText: aside?.innerText.slice(0, 2000) };
});
fs.writeFileSync(`${OUT}/orvilo-view-detail-dom.json`, JSON.stringify(od, null, 2));
console.log('ORV DETAIL:', od.url, 'els:', od.els.length);
for (const e of od.els)
  console.log(`${e.tag} x=${e.x} y=${e.y} ${e.aria || e.title || ''} | ${e.text.slice(0, 50)}`);
console.log('ASIDE:', (od.asideText || 'none').slice(0, 700).replaceAll('\n', ' | '));

for (const [name, sel] of [
  ['orvilo-view-menu', 'button[aria-label="View options"]'],
  ['orvilo-view-addfilter', 'button[aria-label="Add filter"], button[title="Add filter"]'],
  [
    'orvilo-view-displayopts',
    'button[aria-label="Display options"], button[title="Display options"]',
  ],
]) {
  try {
    await page.locator(sel).first().click({ timeout: 10000 });
    await page.waitForTimeout(1400);
    await shot(name);
    await dumpOverlay(name);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);
  } catch (e) {
    console.log(name, 'FAIL', e.message.slice(0, 100));
  }
}

await page.close();
await browser.close();
console.log('DONE-FULL2');
