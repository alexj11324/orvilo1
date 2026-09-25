import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto('https://linear.app/bdiverifier/team/ORV/triage', {
  waitUntil: 'domcontentloaded',
});
await page.waitForTimeout(6000);

const dumpPopup = async (label) => {
  const items = await page.evaluate(() => {
    const out = [];
    // Linear menus/dialogs render in portals — scan all visible popover-ish roots
    const candidates = document.querySelectorAll(
      '[role="menu"], [role="listbox"], [role="dialog"], [data-radix-popper-content-wrapper], [class*="popover"], [class*="Popover"], [id*="popover"]',
    );
    for (const c of candidates) {
      const r = c.getBoundingClientRect();
      if (r.width === 0) continue;
      const rows = [];
      const els = c.querySelectorAll(
        '[role="menuitem"], [role="option"], [role="menuitemcheckbox"], [role="menuitemradio"], button, [role="switch"], input, [role="separator"], hr, [class*="label"], [class*="Label"]',
      );
      for (const el of els) {
        const er = el.getBoundingClientRect();
        if (er.width === 0) continue;
        rows.push({
          tag: el.tagName.toLowerCase(),
          role: el.getAttribute('role'),
          type: el.getAttribute('type'),
          checked: el.getAttribute('aria-checked') ?? el.getAttribute('checked'),
          disabled: el.getAttribute('disabled') !== null || el.getAttribute('aria-disabled'),
          text: el.textContent?.trim().slice(0, 60),
          kbd: el.querySelector('kbd')?.textContent,
        });
      }
      out.push({
        rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
        allText: c.textContent.slice(0, 800),
        rows,
      });
    }
    return out;
  });
  console.log(`=== ${label} ===`);
  console.log(JSON.stringify(items, null, 1));
};

// 1. Open Add filter
await page.getByRole('button', { name: 'Add filter' }).click();
await page.waitForTimeout(1200);
await page.screenshot({ path: '/tmp/parity-audit-2026-09-23/triage/linear-addfilter.png' });
await dumpPopup('ADD FILTER');
await page.keyboard.press('Escape');
await page.waitForTimeout(600);

// 2. Open Display options
await page.getByRole('button', { name: 'Display options' }).click();
await page.waitForTimeout(1200);
await page.screenshot({ path: '/tmp/parity-audit-2026-09-23/triage/linear-displayopts.png' });
await dumpPopup('DISPLAY OPTIONS');
await page.keyboard.press('Escape');
await page.waitForTimeout(600);

await page.close();
process.exit(0);
