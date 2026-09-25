import { chromium } from 'playwright';
import fs from 'fs';
const DIR = '/tmp/parity-project-detail';
const browser = await chromium.connectOverCDP('http://localhost:9222', { timeout: 90000 });
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
const result = { steps: {} };
const dump = (k, v) => {
  result.steps[k] = v;
  fs.writeFileSync(`${DIR}/linear-deep.json`, JSON.stringify(result, null, 1));
};
const shot = (name) => page.screenshot({ path: `${DIR}/${name}.png` });
const menuItems = async () =>
  page.evaluate(() => {
    const items = [
      ...document.querySelectorAll(
        '[role="menu"] [role="menuitem"], [role="menu"] [role="menuitemcheckbox"], [role="menu"] [role="menuitemradio"], [role="listbox"] [role="option"], [data-radix-popper-content-wrapper] [role="menuitem"], [data-radix-popper-content-wrapper] [role="option"]',
      ),
    ];
    const seen = new Set();
    return items
      .map((el) => {
        const r = el.getBoundingClientRect();
        const key = el.textContent + r.y;
        if (seen.has(key)) return null;
        seen.add(key);
        const svg = el.querySelector('svg');
        const kbd = el.querySelector('kbd, [class*="shortcut"], [class*="key"]');
        return {
          text: el.textContent.trim().slice(0, 70),
          role: el.getAttribute('role'),
          y: Math.round(r.y),
          hasIcon: !!svg,
          shortcut: kbd ? kbd.textContent.trim() : null,
          disabled: el.getAttribute('aria-disabled'),
          checked: el.getAttribute('aria-checked'),
        };
      })
      .filter(Boolean);
  });
try {
  await page.goto(
    'https://linear.app/bdiverifier/project/orvilo-linear-parity-3eb13143d468/overview',
    { waitUntil: 'load', timeout: 30000 },
  );
  for (let i = 0; i < 15; i++) {
    await page.waitForTimeout(2000);
    const t = await page.evaluate(() => document.body.innerText.slice(0, 300));
    if (t && !t.startsWith('Loading') && t.includes('Overview')) break;
  }

  // === 1. Header region detailed DOM (project icon button, name, etc.) ===
  const header = await page.evaluate(() => {
    const main = document.querySelector('main') || document.body;
    const els = [...main.querySelectorAll('*')].filter((e) => {
      const r = e.getBoundingClientRect();
      return (
        r.y < 100 &&
        r.y >= 0 &&
        r.height > 0 &&
        r.height < 60 &&
        (e.tagName === 'BUTTON' ||
          e.tagName === 'A' ||
          e.getAttribute('role') ||
          (e.children.length === 0 && e.textContent.trim()))
      );
    });
    return els.map((e) => {
      const r = e.getBoundingClientRect();
      return {
        tag: e.tagName,
        role: e.getAttribute('role'),
        aria: e.getAttribute('aria-label'),
        text: e.children.length === 0 ? e.textContent.trim().slice(0, 50) : '',
        x: Math.round(r.x),
        y: Math.round(r.y),
        w: Math.round(r.width),
        h: Math.round(r.height),
      };
    });
  });
  dump('header', header);

  // === 2. Project actions ⋯ menu ===
  try {
    await page.click('button[aria-label="Project actions"]');
    await page.waitForTimeout(900);
    dump('projectActionsMenu', await menuItems());
    await shot('linear-project-actions-menu');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  } catch (e) {
    dump('projectActionsMenuErr', e.message);
  }

  // === 3. Add new view + button ===
  try {
    await page.click('button[aria-label="Add new view"]');
    await page.waitForTimeout(900);
    dump('addNewView', await menuItems());
    await shot('linear-add-new-view');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  } catch (e) {
    dump('addNewViewErr', e.message);
  }

  // === 4. "Menu" button next to project icon (x=253,y=17) ===
  try {
    await page.click('button[aria-label="Menu"]');
    await page.waitForTimeout(900);
    dump('projectIconMenu', await menuItems());
    await shot('linear-project-icon-menu');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  } catch (e) {
    dump('projectIconMenuErr', e.message);
  }

  // === 5. Right-rail Status picker ===
  try {
    const statusBtn = page.locator('button', { hasText: 'In Progress' }).last();
    await statusBtn.click();
    await page.waitForTimeout(900);
    dump('statusPicker', await menuItems());
    await shot('linear-status-picker');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  } catch (e) {
    dump('statusPickerErr', e.message);
  }

  // === 6. Priority picker (right rail) ===
  try {
    const el = page.locator('span', { hasText: /^No priority$/ }).last();
    await el.click();
    await page.waitForTimeout(900);
    dump('priorityPicker', await menuItems());
    await shot('linear-priority-picker');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  } catch (e) {
    dump('priorityPickerErr', e.message);
  }

  fs.writeFileSync(`${DIR}/linear-deep.json`, JSON.stringify(result, null, 1));
} catch (e) {
  dump('fatal', e.message + '\n' + e.stack);
}
