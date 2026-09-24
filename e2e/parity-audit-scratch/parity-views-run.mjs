// Views parity audit — Linear reference (READ-ONLY) vs Orvilo candidate.
// One page only; navigates between apps via page.goto (tab hygiene).
// Usage: node e2e/parity-views-run.mjs <outdir> <step>
// steps: lin-dir | lin-detail | lin-detail2 | lin-team | orv-dir | orv-detail | orv-detail2
import { chromium } from 'playwright';
import fs from 'node:fs';

const OUT = process.argv[2];
const STEP = process.argv[3];
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.connectOverCDP('http://localhost:9222', { timeout: 120000 });
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
page.setDefaultTimeout(30000);

const shot = async (name) => {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log('shot:', name);
};
const dump = async (name, fn, arg) => {
  try {
    const data = await page.evaluate(fn, arg);
    fs.writeFileSync(`${OUT}/${name}.json`, JSON.stringify(data, null, 2));
    console.log('dump:', name, JSON.stringify(data).slice(0, 500));
  } catch (e) {
    console.log('dump FAIL:', name, e.message.slice(0, 140));
  }
};

// Inventory every visible interactive element incl. icon svg signature.
const inventoryFn = () => {
  const items = [];
  const iconSig = (el) => {
    const svg = el.querySelector?.('svg');
    if (!svg) return null;
    const path = svg.querySelector('path');
    const lucide = svg.getAttribute('class') || '';
    return {
      cls: lucide.slice(0, 60),
      vb: svg.getAttribute('viewBox'),
      d: (path?.getAttribute('d') || '').slice(0, 80),
      nPaths: svg.querySelectorAll('path,circle,rect,line,polyline,polygon').length,
    };
  };
  const walk = (el, depth) => {
    if (depth > 26 || items.length > 700) return;
    if (!el || !el.tagName) return;
    const tag = el.tagName.toLowerCase();
    const role = el.getAttribute?.('role');
    const interactive =
      ['button', 'a', 'input', 'select', 'textarea'].includes(tag) ||
      [
        'button',
        'link',
        'tab',
        'menuitem',
        'option',
        'switch',
        'checkbox',
        'tablist',
        'dialog',
        'menu',
        'listbox',
        'combobox',
      ].includes(role) ||
      el.getAttribute?.('aria-haspopup') ||
      el.getAttribute?.('contenteditable') === 'true';
    if (interactive) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0) {
        items.push({
          tag,
          role,
          aria: el.getAttribute?.('aria-label'),
          title: el.getAttribute?.('title'),
          text: (el.innerText || '').trim().slice(0, 90),
          href: el.getAttribute?.('href'),
          icon: iconSig(el),
          x: Math.round(r.x),
          y: Math.round(r.y),
          w: Math.round(r.width),
          h: Math.round(r.height),
        });
      }
    }
    for (const c of el.children || []) walk(c, depth + 1);
  };
  walk(document.body, 0);
  return { url: location.href, title: document.title, items };
};

// Dump open overlays (menus, popovers, dialogs, listboxes) with item rows.
const popupFn = () => {
  const selectors = [
    '[role=menu]',
    '[role=dialog]',
    '[role=listbox]',
    '[data-radix-popper-content-wrapper]',
    '[class*=popover]',
    '[class*=Popover]',
    '[class*=dropdown]',
    '[class*=Dropdown]',
  ];
  const seen = new Set();
  const out = [];
  for (const sel of selectors) {
    for (const el of document.querySelectorAll(sel)) {
      if (seen.has(el)) continue;
      seen.add(el);
      const r = el.getBoundingClientRect();
      if (r.width < 20 || r.height < 20) continue;
      const rows = [];
      for (const item of el.querySelectorAll(
        '[role=menuitem],[role=menuitemcheckbox],[role=menuitemradio],[role=option],[role=tab],[role=switch],[role=combobox],button,a,[class*=item],[class*=Item]',
      )) {
        const ir = item.getBoundingClientRect();
        if (ir.width === 0) continue;
        const svg = item.querySelector('svg');
        rows.push({
          role: item.getAttribute('role'),
          tag: item.tagName.toLowerCase(),
          text: (
            item.innerText ||
            item.getAttribute('aria-label') ||
            item.getAttribute('placeholder') ||
            ''
          )
            .trim()
            .slice(0, 80),
          aria: item.getAttribute('aria-label'),
          checked: item.getAttribute('aria-checked') ?? item.getAttribute('aria-selected'),
          kbd: !!item.querySelector('kbd'),
          icon: svg
            ? (
                svg.querySelector('path')?.getAttribute('d') ||
                svg.getAttribute('class') ||
                ''
              ).slice(0, 50)
            : null,
          x: Math.round(ir.x),
          y: Math.round(ir.y),
          w: Math.round(ir.width),
          h: Math.round(ir.height),
        });
      }
      out.push({
        sel,
        x: Math.round(r.x),
        y: Math.round(r.y),
        w: Math.round(r.width),
        h: Math.round(r.height),
        text: el.innerText.trim().slice(0, 2000),
        rows,
      });
    }
  }
  return out;
};

const closeAll = async () => {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
};

const clickAndDump = async (name, locator) => {
  try {
    const n = await locator.count();
    console.log(name, 'count:', n);
    if (!n) return false;
    await locator.first().click({ timeout: 8000 });
    await page.waitForTimeout(1400);
    await shot(name);
    await dump(`${name}-items`, popupFn);
    return true;
  } catch (e) {
    console.log(name, 'FAIL', e.message.slice(0, 120));
    return false;
  }
};

try {
  /* ============================= LINEAR ============================= */
  if (STEP === 'lin-dir') {
    await page.goto('https://linear.app/bdiverifier/views/issues', {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await page.waitForTimeout(8000);
    await shot('lin-dir');
    await dump('lin-dir-dom', inventoryFn);
    // display options on populated directory
    await clickAndDump(
      'lin-dir-display',
      page.locator('button[aria-label*="isplay"], button:has-text("Display")'),
    );
    await closeAll();
    // hover first row — reveals star/⋯ affordances
    const row = page.locator('main a[href*="/view/"]').first();
    if (await row.count()) {
      await row.hover();
      await page.waitForTimeout(900);
      await shot('lin-dir-rowhover');
      await dump('lin-dir-rowhover', inventoryFn);
      // right-click → context menu
      await row.click({ button: 'right', timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(1100);
      await shot('lin-dir-ctx');
      await dump('lin-dir-ctx-items', popupFn);
      await closeAll();
    }
    // New view → navigates to creation surface (don't save)
    const nv = page
      .locator(
        'button[aria-label*="view" i]:has-text("New"), button:has-text("New view"), a:has-text("New view")',
      )
      .first();
    console.log('newview btn count:', await nv.count());
    if (await nv.count()) {
      await nv.click({ timeout: 8000 });
      await page.waitForTimeout(2500);
      console.log('after New view URL:', page.url());
      await shot('lin-newview');
      await dump('lin-newview-dom', inventoryFn);
      await page.goBack();
      await page.waitForTimeout(2000);
    }
    // group-edge create entry
    await dump('lin-dir-final', inventoryFn);
    // Projects tab
    await page.goto('https://linear.app/bdiverifier/views/projects', {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await page.waitForTimeout(6000);
    await shot('lin-dir-projects');
    await dump('lin-dir-projects-dom', inventoryFn);
  }

  if (STEP === 'lin-detail') {
    await page.goto('https://linear.app/bdiverifier/view/all-issues-3320169ce6ab', {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await page.waitForTimeout(9000);
    await shot('lin-detail');
    await dump('lin-detail-dom', inventoryFn);
    await dump('lin-detail-title', () => {
      const main = document.querySelector('main') || document.body;
      const h = main.querySelector('h1,h2,[contenteditable],[role=heading]');
      return {
        text: h?.innerText?.trim(),
        ce: h?.getAttribute('contenteditable'),
        tag: h?.tagName,
        html: h?.outerHTML?.slice(0, 1200),
      };
    });
    // ⋯ menu in header
    await clickAndDump(
      'lin-detail-menu',
      page.locator('button[aria-label="Issue view options"], button[aria-label*="view options" i]'),
    );
    await closeAll();
    // Add filter
    await clickAndDump(
      'lin-detail-addfilter',
      page.locator('button[aria-label="Add filter"], button:has-text("Add filter")'),
    );
    // hover a submenu item (Dates) to capture nested catalog
    try {
      const dates = page
        .locator('[role=menuitem]:has-text("Dates"), [role=option]:has-text("Dates")')
        .first();
      if (await dates.count()) {
        await dates.hover();
        await page.waitForTimeout(900);
        await shot('lin-detail-addfilter-dates');
        await dump('lin-detail-addfilter-dates-items', popupFn);
      }
    } catch {}
    await closeAll();
    // Display options
    await clickAndDump(
      'lin-detail-display',
      page.locator(
        'button[aria-label="Display options"], button:has-text("Display options"), button[aria-label*="isplay"]',
      ),
    );
    await closeAll();
  }

  if (STEP === 'lin-detail2') {
    await page.goto('https://linear.app/bdiverifier/view/all-issues-3320169ce6ab', {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await page.waitForTimeout(9000);
    // details pane content + its tabs + pane menu
    await dump(
      'lin-pane-text',
      () => document.querySelector('aside')?.innerText.slice(0, 2500) ?? 'NO ASIDE',
    );
    await clickAndDump('lin-pane-tabs', page.locator('aside [role=tab], aside button').nth(1));
    await closeAll();
    await clickAndDump(
      'lin-pane-menu',
      page
        .locator('aside button[aria-label*="menu" i], aside button[aria-label*="option" i]')
        .first(),
    );
    await closeAll();
    // close details pane button
    await clickAndDump(
      'lin-detail-closepane',
      page.locator('button[aria-label*="view details" i], button[aria-label*="details" i]').last(),
    );
    await page.waitForTimeout(900);
    await shot('lin-detail-paneclosed');
    await dump('lin-detail-paneclosed-dom', inventoryFn);
    // favorite star in header
    await dump('lin-detail-fav', () => {
      const btns = [...document.querySelectorAll('main button, header button')];
      return btns
        .map((b) => ({
          aria: b.getAttribute('aria-label'),
          text: (b.innerText || '').trim().slice(0, 40),
          y: Math.round(b.getBoundingClientRect().y),
          x: Math.round(b.getBoundingClientRect().x),
        }))
        .filter((b) => b.y < 60);
    });
    // filter row controls: does the view have filter rows? capture toolbar chips
    await dump('lin-detail-toolbar-chips', () => {
      const tb = document.querySelector('main');
      return tb ? tb.innerText.slice(0, 1200) : '';
    });
  }

  if (STEP === 'lin-team') {
    await page.goto('https://linear.app/bdiverifier/team/ORV/views/issues', {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await page.waitForTimeout(8000);
    await shot('lin-team-dir');
    await dump('lin-team-dir-dom', inventoryFn);
    await clickAndDump(
      'lin-team-display',
      page.locator('button[aria-label*="isplay"], button:has-text("Display")'),
    );
    await closeAll();
  }

  /* ============================= ORVILO ============================= */
  if (STEP === 'orv-dir') {
    await page.goto('http://localhost:3010/agent-testing/views', {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await page.waitForTimeout(8000);
    if (page.url().includes('/signin')) {
      console.log('SIGNIN BOUNCE — run login script');
    }
    await shot('orv-dir');
    await dump('orv-dir-dom', inventoryFn);
    await clickAndDump(
      'orv-dir-display',
      page.locator('button[aria-label*="isplay" i], button[title*="isplay" i]'),
    );
    await closeAll();
    const row = page
      .locator('tbody tr:not([data-list-section]), main a[href*="/views/sv"]')
      .first();
    if (await row.count()) {
      await row.hover();
      await page.waitForTimeout(900);
      await shot('orv-dir-rowhover');
      await dump('orv-dir-rowhover', inventoryFn);
      await row.click({ button: 'right', timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(1100);
      await shot('orv-dir-ctx');
      await dump('orv-dir-ctx-items', popupFn);
      await closeAll();
    }
    // New view modal
    await clickAndDump('orv-newview', page.locator('button:has-text("New view")'));
    await closeAll();
    // group-edge create entry
    await clickAndDump(
      'orv-createedge',
      page.locator('button:has-text("private"), button:has-text("Create")'),
    );
    await closeAll();
    // projects tab
    await page.goto('http://localhost:3010/agent-testing/views?entity=project', {
      waitUntil: 'domcontentloaded',
      timeout: 45000,
    });
    await page.waitForTimeout(6000);
    await shot('orv-dir-projects');
    await dump('orv-dir-projects-dom', inventoryFn);
  }

  if (STEP === 'orv-detail') {
    await page.goto('http://localhost:3010/agent-testing/views/svparityvol0001', {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await page.waitForTimeout(9000);
    await shot('orv-detail');
    await dump('orv-detail-dom', inventoryFn);
    await dump('orv-detail-title', () => {
      const main = document.querySelector('main') || document.body;
      const h = main.querySelector('h1,h2,[contenteditable],[role=heading]');
      return {
        text: h?.innerText?.trim(),
        ce: h?.getAttribute('contenteditable'),
        tag: h?.tagName,
        html: h?.outerHTML?.slice(0, 1200),
      };
    });
    await clickAndDump(
      'orv-detail-menu',
      page.locator('button[aria-label*="option" i], button[aria-label*="Options" i]').last(),
    );
    await closeAll();
    await clickAndDump(
      'orv-detail-addfilter',
      page.locator('button[aria-label*="filter" i], button[title*="filter" i]'),
    );
    await closeAll();
    await clickAndDump(
      'orv-detail-display',
      page.locator('button[aria-label*="isplay" i], button[title*="isplay" i]').last(),
    );
    await closeAll();
  }

  if (STEP === 'orv-detail2') {
    await page.goto('http://localhost:3010/agent-testing/views/svparityvol0001', {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await page.waitForTimeout(9000);
    await dump(
      'orv-pane-text',
      () => document.querySelector('aside')?.innerText.slice(0, 2500) ?? 'NO ASIDE',
    );
    // facet tabs inside pane
    await clickAndDump(
      'orv-pane-tab-teams',
      page.locator('aside button:has-text("Teams"), aside [role=tab]:has-text("Teams")'),
    );
    await closeAll();
    // close details pane
    await clickAndDump(
      'orv-detail-closepane',
      page.locator('button[aria-label*="details" i], button[title*="details" i]').last(),
    );
    await page.waitForTimeout(900);
    await shot('orv-detail-paneclosed');
    await dump('orv-detail-paneclosed-dom', inventoryFn);
  }
} finally {
  await page.close();
  await browser.close();
}
console.log('DONE', STEP);
