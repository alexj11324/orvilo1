import { chromium } from 'playwright';
import fs from 'node:fs';
const OUT = '/Users/devin/repos/wt-parity-views/.agents/runtime-acceptance/parity-2026-09-23/views';
const R = {};
const b = await chromium.connectOverCDP('http://localhost:9222', { timeout: 120000 });
const p = await b.contexts()[0].newPage();
p.setDefaultTimeout(20000);
const overlay = async () =>
  await p.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll(
      '[role=menu],[role=dialog],[role=listbox],[data-radix-popper-content-wrapper],[class*=Tooltip]',
    )) {
      const r = el.getBoundingClientRect();
      if (r.width > 20 && r.height > 20)
        out.push({
          sel: el.getAttribute('role') || el.tagName,
          w: Math.round(r.width),
          h: Math.round(r.height),
          text: el.innerText.trim().slice(0, 800),
        });
    }
    return out;
  });
try {
  // 1. directory column header sort reaction
  await p.goto('https://linear.app/bdiverifier/views/issues', {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await p.waitForTimeout(8000);
  const nameBtn = p.locator('button[aria-label="Order by Name"]');
  R.nameBtnExists = await nameBtn.count();
  if (await nameBtn.count()) {
    await nameBtn.click();
    await p.waitForTimeout(1200);
    R.afterNameClick = { url: p.url(), overlays: await overlay() };
    // click again to restore asc
    await nameBtn.click();
    await p.waitForTimeout(800);
  }
  // 2. detail: Menu button at header left
  await p.goto('https://linear.app/bdiverifier/view/all-issues-3320169ce6ab', {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await p.waitForTimeout(9000);
  const menuBtn = p.locator('main button[aria-label="Menu"], button[aria-label="Menu"]').first();
  R.menuBtnCount = await p.locator('button[aria-label="Menu"]').count();
  if (await menuBtn.count()) {
    await menuBtn.click();
    await p.waitForTimeout(1300);
    R.menuClick = { url: p.url(), overlays: await overlay() };
    await p.screenshot({ path: `${OUT}/lin-detail-menubtn.png` });
    await p.keyboard.press('Escape');
    await p.waitForTimeout(600);
  }
  // 3. title click
  const h2 = p.locator('main h2').first();
  R.h2count = await h2.count();
  if (await h2.count()) {
    await h2.click();
    await p.waitForTimeout(1000);
    R.titleClick = {
      overlays: await overlay(),
      active: await p.evaluate(
        () =>
          document.activeElement?.tagName +
          '/' +
          (document.activeElement?.getAttribute('contenteditable') || ''),
      ),
    };
    await p.keyboard.press('Escape');
    await p.waitForTimeout(500);
  }
  // 4. Visibility "Personal" button in pane
  const vis = p.locator('aside button:has-text("Personal")').first();
  R.visCount = await vis.count();
  if (await vis.count()) {
    await vis.click();
    await p.waitForTimeout(1200);
    R.visClick = { overlays: await overlay() };
    await p.screenshot({ path: `${OUT}/lin-pane-vis.png` });
    await p.keyboard.press('Escape');
    await p.waitForTimeout(600);
  }
  // 5. owner button
  const owner = p.locator('aside button:has-text("Alex Jiang")').first();
  if (await owner.count()) {
    await owner.click();
    await p.waitForTimeout(1200);
    R.ownerClick = { overlays: await overlay() };
    await p.screenshot({ path: `${OUT}/lin-pane-owner.png` });
    await p.keyboard.press('Escape');
    await p.waitForTimeout(600);
  }
  // 6. facet row click (count button "124")
  const facetRow = p.locator('aside div:has-text("No assignee")').last();
  R.facetRowCount = await facetRow.count();
  if (await facetRow.count()) {
    await facetRow.click();
    await p.waitForTimeout(1400);
    R.facetClick = { url: p.url(), overlays: await overlay() };
    await p.screenshot({ path: `${OUT}/lin-pane-facet-click.png` });
    await p.keyboard.press('Escape');
    await p.waitForTimeout(500);
  }
} finally {
  await p.close();
  await b.close();
}
fs.writeFileSync('/tmp/pv-reactions.json', JSON.stringify(R, null, 1));
