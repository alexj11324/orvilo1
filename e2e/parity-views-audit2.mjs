// Views parity audit — continued. Linear reference (read-only) + Orvilo candidate.
// Connects to the shared authenticated Chrome on :9817. Creates its OWN page only.
// Usage: node e2e/parity-views-audit2.mjs <outdir> <step>
//   steps: linear-detail | linear-menu | linear-filters | linear-display | linear-team
//          orvilo-dir | orvilo-detail | orvilo-menu | orvilo-display
import fs from 'node:fs';

import { chromium } from 'playwright';

const OUT = process.argv[2] || '/tmp/parity-views';
const STEP = process.argv[3] || 'linear-detail';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.connectOverCDP('http://localhost:9817');
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
page.setDefaultTimeout(20000);

const shot = async (name) => {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log('shot:', name);
};
const dump = async (name, fn, arg) => {
  try {
    const data = await page.evaluate(fn, arg);
    fs.writeFileSync(`${OUT}/${name}.json`, JSON.stringify(data, null, 2));
    console.log('dump:', name, JSON.stringify(data).slice(0, 600));
  } catch (e) {
    console.log('dump FAIL:', name, e.message);
  }
};

// Dump every visible interactive element + key geometry in the page/popup.
const inventoryFn = () => {
  const items = [];
  const walk = (el, depth) => {
    if (depth > 16 || items.length > 600) return;
    if (!el || !el.tagName) return;
    const tag = el.tagName.toLowerCase();
    const role = el.getAttribute?.('role');
    const aria = el.getAttribute?.('aria-label');
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
        'columnheader',
        'tablist',
        'dialog',
        'menu',
        'listbox',
      ].includes(role) ||
      el.getAttribute?.('aria-haspopup');
    if (interactive) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0) {
        items.push({
          tag,
          role,
          aria,
          text: (el.innerText || el.getAttribute('title') || '').trim().slice(0, 100),
          href: el.getAttribute('href'),
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

// Dump the currently open popup/menu (portaled content included).
const popupFn = () => {
  const selectors = [
    '[role=menu]',
    '[role=dialog]',
    '[role=listbox]',
    '[data-radix-popper-content-wrapper]',
    '.l7-popup',
    '[class*=popover]',
    '[class*=Popover]',
    '[class*=dropdown]',
    '[class*=Dropdown]',
    '[class*=menu]',
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
        '[role=menuitem],[role=menuitemcheckbox],[role=menuitemradio],[role=option],[role=tab],[role=switch],button,a,[class*=item],[class*=Item],[class*=row],[class*=Row]',
      )) {
        const ir = item.getBoundingClientRect();
        if (ir.width === 0) continue;
        rows.push({
          role: item.getAttribute('role'),
          text: (item.innerText || item.getAttribute('aria-label') || '').trim().slice(0, 80),
          aria: item.getAttribute('aria-label'),
          kbd: !!item.querySelector('kbd,[class*=shortcut],[class*=Shortcut]'),
          icon: !!item.querySelector('svg'),
          x: Math.round(ir.x),
          y: Math.round(ir.y),
        });
      }
      out.push({
        sel,
        x: Math.round(r.x),
        y: Math.round(r.y),
        w: Math.round(r.width),
        h: Math.round(r.height),
        text: el.innerText.trim().slice(0, 1500),
        rows,
      });
    }
  }
  return out;
};

const closeAll = async () => {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
};

try {
  /* ------------------------- Linear detail ------------------------- */
  if (STEP === 'linear-detail') {
    await page.goto('https://linear.app/bdiverifier/view/all-issues-3320169ce6ab', {
      waitUntil: 'domcontentloaded',
      timeout: 45000,
    });
    await page.waitForTimeout(9000);
    await shot('lin2-detail');
    await dump('lin2-detail-dom', inventoryFn);
    // Title row details — is the title editable? icon?
    await dump('lin2-detail-title', () => {
      const main = document.querySelector('main') || document.body;
      const h1 = main.querySelector('h1,h2,[contenteditable]');
      return {
        h1Text: h1?.innerText?.trim(),
        h1Editable: h1?.getAttribute('contenteditable'),
        h1Tag: h1?.tagName,
        h1Html: h1?.outerHTML?.slice(0, 1500),
      };
    });
  }

  if (STEP === 'linear-menu') {
    await page.goto('https://linear.app/bdiverifier/view/all-issues-3320169ce6ab', {
      waitUntil: 'domcontentloaded',
      timeout: 45000,
    });
    await page.waitForTimeout(9000);
    // Open the ⋯ view-options menu in the header
    const menuBtn = page
      .locator('button[aria-label*="options" i], button[aria-label*="menu" i]')
      .last();
    console.log(
      'menuBtn count:',
      await page.locator('button[aria-label*="options" i], button[aria-label*="menu" i]').count(),
    );
    if (await menuBtn.count()) {
      await menuBtn.click();
      await page.waitForTimeout(1200);
      await shot('lin2-menu-open');
      await dump('lin2-menu-items', popupFn);
      await closeAll();
    }
    // details pane controls: open the pane menu if present
    await dump('lin2-after-menu', inventoryFn);
  }

  if (STEP === 'linear-filters') {
    await page.goto('https://linear.app/bdiverifier/view/all-issues-3320169ce6ab', {
      waitUntil: 'domcontentloaded',
      timeout: 45000,
    });
    await page.waitForTimeout(9000);
    const addFilter = page
      .locator('button:has-text("Add filter"), [role=button]:has-text("Add filter")')
      .first();
    if (await addFilter.count()) {
      await addFilter.click();
      await page.waitForTimeout(1200);
      await shot('lin2-addfilter');
      await dump('lin2-addfilter-items', popupFn);
      // hover a submenu-capable item to catch nested catalogs
      const dates = page
        .locator('[role=menuitem]:has-text("Dates"), [role=option]:has-text("Dates")')
        .first();
      if (await dates.count()) {
        await dates.hover();
        await page.waitForTimeout(800);
        await shot('lin2-addfilter-dates');
        await dump('lin2-addfilter-dates-items', popupFn);
      }
      await closeAll();
    } else {
      console.log('no Add filter');
    }
  }

  if (STEP === 'linear-display') {
    await page.goto('https://linear.app/bdiverifier/view/all-issues-3320169ce6ab', {
      waitUntil: 'domcontentloaded',
      timeout: 45000,
    });
    await page.waitForTimeout(9000);
    const disp = page
      .locator('button:has-text("Display options"), button[aria-label*="Display" i]')
      .first();
    if (await disp.count()) {
      await disp.click();
      await page.waitForTimeout(1500);
      await shot('lin2-display');
      await dump('lin2-display-items', popupFn);
      await closeAll();
    } else {
      console.log('no Display options btn');
    }
  }

  /* ------------------------- Linear team views ------------------------- */
  if (STEP === 'linear-team') {
    await page.goto('https://linear.app/bdiverifier/team/ORV/views/issues', {
      waitUntil: 'domcontentloaded',
      timeout: 45000,
    });
    await page.waitForTimeout(9000);
    await shot('lin2-team-dir');
    await dump('lin2-team-dir-dom', inventoryFn);
    const disp = page
      .locator('button:has-text("Display options"), button[aria-label*="Display" i]')
      .first();
    if (await disp.count()) {
      await disp.click();
      await page.waitForTimeout(1200);
      await dump('lin2-team-display-items', popupFn);
      await closeAll();
    }
    await page.goto('https://linear.app/bdiverifier/team/ORV/views/projects', {
      waitUntil: 'domcontentloaded',
      timeout: 45000,
    });
    await page.waitForTimeout(7000);
    await shot('lin2-team-dir-projects');
    await dump('lin2-team-dir-projects-dom', inventoryFn);
  }

  /* ------------------------- Orvilo candidate ------------------------- */
  if (STEP === 'orvilo-dir') {
    await page.goto('http://localhost:3010/agent-testing/views', {
      waitUntil: 'domcontentloaded',
      timeout: 45000,
    });
    await page.waitForTimeout(8000);
    await shot('orv2-dir');
    await dump('orv2-dir-dom', inventoryFn);
    const disp = page
      .locator('button[aria-label*="Display" i], button[title*="Display" i]')
      .first();
    if (await disp.count()) {
      await disp.click();
      await page.waitForTimeout(1000);
      await shot('orv2-dir-display');
      await dump('orv2-dir-display-items', popupFn);
      await closeAll();
    }
    // projects tab
    await page.goto('http://localhost:3010/agent-testing/views?entity=project', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await page.waitForTimeout(5000);
    await shot('orv2-dir-projects');
    await dump('orv2-dir-projects-dom', inventoryFn);
  }

  if (STEP === 'orvilo-detail') {
    await page.goto('http://localhost:3010/agent-testing/views/svparityvol0001', {
      waitUntil: 'domcontentloaded',
      timeout: 45000,
    });
    await page.waitForTimeout(9000);
    await shot('orv2-detail');
    await dump('orv2-detail-dom', inventoryFn);
  }

  if (STEP === 'orvilo-menu') {
    await page.goto('http://localhost:3010/agent-testing/views/svparityvol0001', {
      waitUntil: 'domcontentloaded',
      timeout: 45000,
    });
    await page.waitForTimeout(9000);
    // the ⋯ menu — aria-label "View options"
    const menu = page
      .locator('button[aria-label*="option" i], button[aria-label*="Options" i]')
      .last();
    console.log('menu count:', await menu.count());
    if (await menu.count()) {
      await menu.click();
      await page.waitForTimeout(1200);
      await shot('orv2-menu-open');
      await dump('orv2-menu-items', popupFn);
      await closeAll();
    }
  }

  if (STEP === 'orvilo-display') {
    await page.goto('http://localhost:3010/agent-testing/views/svparityvol0001', {
      waitUntil: 'domcontentloaded',
      timeout: 45000,
    });
    await page.waitForTimeout(9000);
    const disp = page
      .locator('button[aria-label*="Display" i], button[title*="Display" i]')
      .first();
    if (await disp.count()) {
      await disp.click();
      await page.waitForTimeout(1200);
      await shot('orv2-detail-display');
      await dump('orv2-detail-display-items', popupFn);
      await closeAll();
    }
    const addF = page.locator('button[aria-label*="filter" i], button[title*="filter" i]').first();
    if (await addF.count()) {
      await addF.click();
      await page.waitForTimeout(1200);
      await shot('orv2-detail-addfilter');
      await dump('orv2-detail-addfilter-items', popupFn);
      await closeAll();
    }
  }
} finally {
  await page.close();
  await browser.close();
}
console.log('DONE', STEP);
