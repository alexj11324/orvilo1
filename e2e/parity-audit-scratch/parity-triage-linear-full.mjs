import { connect, shot } from './parity-triage-lib.mjs';
const browser = await connect();
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto('https://linear.app/bdiverifier/team/ORV/triage', {
  waitUntil: 'domcontentloaded',
  timeout: 45000,
});
await page.waitForTimeout(6000);
console.log('ON TRIAGE:', page.url());

// Helper: dump a popup's rows by scanning all portal-ish containers
const dumpPopup = async (label) => {
  const items = await page.evaluate(() => {
    const out = [];
    const candidates = document.querySelectorAll(
      '[role="menu"], [role="listbox"], [role="dialog"], [class*="popper" i], [class*="popover" i], [id*="popover"], [data-radix-popper-content-wrapper], [data-state="open"]',
    );
    for (const c of candidates) {
      const r = c.getBoundingClientRect();
      if (r.width < 100 || r.height < 40) continue;
      const rows = [];
      for (const el of c.querySelectorAll(
        '[role="menuitem"], [role="option"], [role="menuitemcheckbox"], [role="menuitemradio"], [role="switch"], button, input, li, [role="separator"], hr',
      )) {
        const er = el.getBoundingClientRect();
        if (er.width === 0) continue;
        rows.push({
          tag: el.tagName.toLowerCase(),
          role: el.getAttribute('role'),
          type: el.getAttribute('type'),
          checked:
            el.getAttribute('aria-checked') ?? (el.checked !== undefined ? el.checked : null),
          pressed: el.getAttribute('aria-pressed'),
          disabled: el.getAttribute('disabled') !== null || el.getAttribute('aria-disabled'),
          text: el.textContent?.trim().slice(0, 70),
          rect: [Math.round(er.x), Math.round(er.y), Math.round(er.width), Math.round(er.height)],
        });
      }
      out.push({
        rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
        allText: c.textContent.slice(0, 600),
        rows,
      });
    }
    return out;
  });
  console.log(`=== ${label} ===`);
  console.log(JSON.stringify(items));
  return items;
};

// 1. Display options — open, dump, then toggle "Show snoozed" ON to reveal snoozed rows
await page.getByRole('button', { name: 'Display options' }).click();
await page.waitForTimeout(1200);
await shot(page, '/tmp/parity-audit-2026-09-23/triage/linear-displayopts.png');
const opts = await dumpPopup('DISPLAY OPTIONS');
// Find the Show snoozed switch inside the popup and toggle it ON
const snoozeToggle = await page.evaluate(() => {
  const all = [...document.querySelectorAll('[role="switch"], input[type="checkbox"], button')];
  for (const el of all) {
    const parent = el.closest('div');
    if (parent && /snoozed/i.test(parent.textContent || '') && parent.textContent.length < 60) {
      const r = el.getBoundingClientRect();
      return {
        found: true,
        tag: el.tagName,
        role: el.getAttribute('role'),
        rect: [r.x, r.y, r.width, r.height],
        checked: el.getAttribute('aria-checked'),
      };
    }
  }
  // fallback: any switch in a popup
  const sw = [...document.querySelectorAll('[role="switch"]')].filter(
    (e) => e.getBoundingClientRect().width > 0,
  );
  return sw.length
    ? {
        found: 'any',
        rect: (() => {
          const r = sw[0].getBoundingClientRect();
          return [r.x, r.y, r.width, r.height];
        })(),
        checked: sw[0].getAttribute('aria-checked'),
      }
    : { found: false };
});
console.log('SNOOZE TOGGLE:', JSON.stringify(snoozeToggle));
if (snoozeToggle && snoozeToggle.rect) {
  await page.mouse.click(
    snoozeToggle.rect[0] + snoozeToggle.rect[2] / 2,
    snoozeToggle.rect[1] + snoozeToggle.rect[3] / 2,
  );
  await page.waitForTimeout(2000);
  await shot(page, '/tmp/parity-audit-2026-09-23/triage/linear-showsnoozed.png');
  const rowsNow = await page.evaluate(() => {
    const listPane = document.evaluate('//div', document, null, XPathResult.ANY_TYPE, null);
    return document.body.innerText.slice(0, 400);
  });
  console.log('AFTER SNOOZED TEXT:', rowsNow.slice(0, 300));
  // toggle back OFF
  await page
    .getByRole('button', { name: 'Display options' })
    .click()
    .catch(() => {});
  await page.waitForTimeout(800);
  const sw2 = await page.evaluate(() => {
    const sw = [...document.querySelectorAll('[role="switch"]')].filter(
      (e) => e.getBoundingClientRect().width > 0,
    );
    if (!sw.length) return null;
    const r = sw[0].getBoundingClientRect();
    return { rect: [r.x, r.y, r.width, r.height], checked: sw[0].getAttribute('aria-checked') };
  });
  if (sw2 && sw2.checked === 'true') {
    await page.mouse.click(sw2.rect[0] + sw2.rect[2] / 2, sw2.rect[1] + sw2.rect[3] / 2);
    await page.waitForTimeout(500);
    console.log('snoozed toggled back off');
  }
}
await page.keyboard.press('Escape');
await page.waitForTimeout(400);

// 2. Keyboard shortcuts dialog
await page.mouse.click(440, 300);
await page.waitForTimeout(300);
await page.keyboard.press('?');
await page.waitForTimeout(1800);
await shot(page, '/tmp/parity-audit-2026-09-23/triage/linear-shortcuts.png');
const kbd = await page.evaluate(() => {
  const dialogs = [
    ...document.querySelectorAll(
      '[role="dialog"], [role="alertdialog"], [data-state="open"], [class*="modal" i]',
    ),
  ];
  const results = [];
  for (const d of dialogs) {
    const r = d.getBoundingClientRect();
    if (r.width < 200) continue;
    results.push({ rect: [Math.round(r.x), Math.round(r.y)], text: d.innerText.slice(0, 6000) });
  }
  return results;
});
console.log('=== SHORTCUTS DIALOG TEXT ===');
console.log(JSON.stringify(kbd));
await page.keyboard.press('Escape');
await page.close();
process.exit(0);
