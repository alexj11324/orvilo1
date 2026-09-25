import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto('https://linear.app/bdiverifier/inbox/priority', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('button[aria-label="Notification actions"]', { timeout: 20000 });
await page.waitForTimeout(2500);

const dumpMenu = async (name) => {
  const items = await page.evaluate(() => {
    // Linear menus render in a portal — grab role=menuitem/menuitemcheckbox/menuitemradio + menu container text
    const menus = [
      ...document.querySelectorAll(
        '[role="menu"], [role="listbox"], [data-radix-popper-content-wrapper], [class*="menu"]',
      ),
    ].filter((el) => el.getBoundingClientRect().width > 50);
    const res = [];
    for (const m of menus) {
      const r = m.getBoundingClientRect();
      res.push({
        rect: `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}`,
        text: (m.innerText || '').slice(0, 800),
        items: [
          ...m.querySelectorAll(
            '[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], [role="option"], [role="switch"], button, a',
          ),
        ]
          .map((i) => ({
            role: i.getAttribute('role'),
            text: (i.innerText || '').trim().replace(/\n/g, '|').slice(0, 90),
            checked: i.getAttribute('aria-checked'),
            disabled: i.getAttribute('aria-disabled'),
          }))
          .slice(0, 40),
      });
    }
    return res;
  });
  console.log(`=== MENU ${name} ===`);
  console.log(JSON.stringify(items, null, 1).slice(0, 6000));
};

// 1. Notification actions (⋯)
await page.click('button[aria-label="Notification actions"]');
await page.waitForTimeout(1200);
await page.screenshot({ path: '/tmp/parity-inbox-evidence/linear-menu-actions.png' });
await dumpMenu('notification-actions');
await page.keyboard.press('Escape');
await page.waitForTimeout(600);

// 2. Add filter
await page.click('button[aria-label="Add filter"]');
await page.waitForTimeout(1200);
await page.screenshot({ path: '/tmp/parity-inbox-evidence/linear-menu-filter.png' });
await dumpMenu('add-filter');
await page.keyboard.press('Escape');
await page.waitForTimeout(600);

// 3. Display options
await page.click('button[aria-label="Display options"]');
await page.waitForTimeout(1200);
await page.screenshot({ path: '/tmp/parity-inbox-evidence/linear-menu-display.png' });
await dumpMenu('display-options');
await page.keyboard.press('Escape');
await page.waitForTimeout(600);

// 4. "Menu" button (leftmost) — probably harmless nav menu; open to see
await page.click('button[aria-label="Menu"]');
await page.waitForTimeout(1200);
await page.screenshot({ path: '/tmp/parity-inbox-evidence/linear-menu-menu.png' });
await dumpMenu('menu-btn');
await page.keyboard.press('Escape');
await page.close();
await browser.close();
