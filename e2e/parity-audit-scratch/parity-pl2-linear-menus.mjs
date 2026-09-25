/* Linear projects — menus: Display options, Add filter, sidebar, add-view, page menu, cell clicks. */
import { chromium } from 'playwright';
import fs from 'node:fs';

const OUT =
  '/Users/devin/repos/wt-parity-projects-list/.agents/runtime-acceptance/parity-2026-09-23/projects-list';
fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => {
  console.log(...a);
  fs.appendFileSync(`${OUT}/linear-menus.log`, a.join(' ') + '\n');
};

let browser;
for (let i = 0; i < 8; i++) {
  try {
    browser = await chromium.connectOverCDP('http://localhost:9222', { timeout: 120000 });
    break;
  } catch (e) {
    log(`connect retry ${i}`);
    await new Promise((r) => setTimeout(r, 5000));
  }
}
if (!browser) process.exit(1);
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
await page.setViewportSize({ width: 1440, height: 900 });
try {
  await page.goto('https://linear.app/bdiverifier/projects/all', {
    waitUntil: 'commit',
    timeout: 30000,
  });
} catch {}
await page.bringToFront().catch(() => {});
await page.waitForTimeout(9000);
log('URL:', page.url());

const clickByLabel = async (re) => {
  const box = await page.evaluate((reSrc) => {
    const rx = new RegExp(reSrc, 'i');
    const els = [...document.querySelectorAll('button, [role="button"], a')];
    const el = els.find((e) => {
      const r = e.getBoundingClientRect();
      if (r.width === 0) return false;
      const lbl = e.getAttribute('aria-label') || e.getAttribute('title') || '';
      return rx.test(lbl);
    });
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, re.source);
  if (!box) return false;
  await page.mouse.click(box.x, box.y);
  return true;
};

const dumpOverlay = async (tag) => {
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${OUT}/linear-menu-${tag}.png` });
  const data = await page.evaluate(() => {
    const cands = [
      ...document.querySelectorAll(
        'body > div, [role="menu"], [role="dialog"], [role="listbox"], [data-radix-popper-content-wrapper], [class*="popover" i], [class*="menu" i]',
      ),
    ]
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.width > 60 && r.height > 40 && r.y < 900 && r.width < 800)
      .sort((a, b) => b.r.y - a.r.y);
    return {
      texts: cands
        .slice(0, 4)
        .map(
          ({ el, r }) =>
            `[${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}] ` +
            el.innerText,
        ),
      // also grab inner controls inside top overlay
      controls: cands.slice(0, 2).flatMap(({ el }) =>
        [
          ...el.querySelectorAll(
            'button, [role="button"], [role="option"], [role="menuitem"], [role="switch"], [role="radio"], input, [role="checkbox"], a',
          ),
        ].map((c) => {
          const r = c.getBoundingClientRect();
          return `${c.tagName.toLowerCase()}[${c.getAttribute('role') || ''}] "${(c.getAttribute('aria-label') || (c.innerText || '').replace(/\s+/g, ' ').trim()).slice(0, 60)}" @${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}${c.disabled ? ' DISABLED' : ''}${c.getAttribute('aria-checked') != null ? ' checked=' + c.getAttribute('aria-checked') : ''}`;
        }),
      ),
    };
  });
  fs.writeFileSync(`${OUT}/linear-menu-${tag}.txt`, data.texts.join('\n----\n'));
  log(`\n=== ${tag} ===\n` + data.texts.join('\n----\n').replace(/\n+/g, ' | ').slice(0, 1800));
  log('--- controls ---\n' + data.controls.slice(0, 40).join('\n'));
};

// 1. Display options
if (await clickByLabel(/^display options$/i)) await dumpOverlay('display-options');
else log('display options NOT FOUND');
await page.keyboard.press('Escape');
await page.waitForTimeout(800);

// 2. Add filter
if (await clickByLabel(/^add filter$/i)) await dumpOverlay('add-filter');
else log('add filter NOT FOUND');
await page.keyboard.press('Escape');
await page.waitForTimeout(800);

// 3. Open sidebar (aggregate right panel)
if (await clickByLabel(/open sidebar|close sidebar/i)) {
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/linear-menu-sidebar.png` });
  const sb = await page.evaluate(() => {
    // the right panel: find elements x > 1000 forming a column
    const panes = [
      ...document.querySelectorAll(
        'aside, [class*="sidebar" i], [class*="panel" i], [role="complementary"]',
      ),
    ]
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.width > 200 && r.x > 900);
    return panes
      .map(
        ({ el, r }) =>
          `[${Math.round(r.x)} ${Math.round(r.width)}x${Math.round(r.height)}] ${el.innerText.slice(0, 1500)}`,
      )
      .join('\n---\n');
  });
  fs.writeFileSync(`${OUT}/linear-menu-sidebar.txt`, sb);
  log('\n=== sidebar ===\n' + sb.replace(/\n+/g, ' | ').slice(0, 1800));
  // close it back
  await clickByLabel(/close sidebar/i);
  await page.waitForTimeout(800);
}

// 4. "Add new view" + — open then Esc (read-only)
if (await clickByLabel(/add new view/i)) await dumpOverlay('add-new-view');
await page.keyboard.press('Escape');
await page.waitForTimeout(700);

// 5. Page "Menu" button (⋯ next to Projects title)
if (await clickByLabel(/^menu$/i)) await dumpOverlay('page-menu');
await page.keyboard.press('Escape');
await page.waitForTimeout(700);

// 6. Row cell clicks (first row): priority, target date, issues, status — open + Esc
const cellClick = async (x, tag) => {
  const box = await page.evaluate((xTarget) => {
    const rows = [...document.querySelectorAll('a')].filter((a) => {
      const r = a.getBoundingClientRect();
      return r.width > 800 && r.height >= 40 && r.height <= 60 && r.y > 100;
    });
    const row = rows[0];
    if (!row) return null;
    const btns = [...row.querySelectorAll('button, [role="button"], input')];
    const b = btns.find((b) => {
      const r = b.getBoundingClientRect();
      return r.width > 0 && Math.abs(r.x + r.width / 2 - xTarget) < 45;
    });
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, x);
  if (!box) {
    log(`cellClick ${tag}: none near x=${x}`);
    return;
  }
  await page.mouse.click(box.x, box.y);
  await dumpOverlay(`cell-${tag}`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(700);
};

await cellClick(905, 'icon'); // Choose icon
await cellClick(1030, 'priority');
await cellClick(1105, 'lead');
await cellClick(1180, 'targetdate');
await cellClick(1275, 'issues');
await cellClick(1330, 'status');

// 7. right-click first row
const rowBox = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('a')].filter((a) => {
    const r = a.getBoundingClientRect();
    return r.width > 800 && r.height >= 40 && r.height <= 60 && r.y > 100;
  });
  const r = rows[0]?.getBoundingClientRect();
  return r ? { x: r.x + 500, y: r.y + r.height / 2 } : null;
});
if (rowBox) {
  await page.mouse.click(rowBox.x, rowBox.y, { button: 'right' });
  await dumpOverlay('context-menu');
  await page.keyboard.press('Escape');
}

// 8. column header click (sort toggle) — click "Order by Name" then screenshot sort indicator
if (await clickByLabel(/order by name/i)) {
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/linear-sorted-name.png` });
  const hdr = await page.evaluate(() =>
    [...document.querySelectorAll('button')]
      .filter((b) => /order by/i.test(b.getAttribute('aria-label') || ''))
      .map((b) => b.getAttribute('aria-label')),
  );
  log('headers after sort:', JSON.stringify(hdr));
}

await page.close();
await browser.close();
log('DONE');
