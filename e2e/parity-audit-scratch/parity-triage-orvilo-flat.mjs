import { chromium } from 'playwright';
const DIR = '/tmp/parity-audit-2026-09-23/triage';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const say = (...a) => console.log(...a);

// login
await page.goto('http://localhost:3010/signin', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(5000);
const dismissAgree = async () => {
  const agree = page.getByRole('button', { name: /agree and continue/i });
  if (
    (await agree.count()) &&
    (await agree
      .first()
      .isVisible()
      .catch(() => false))
  ) {
    await agree.first().click();
    await page.waitForTimeout(800);
  }
};
for (let attempt = 1; attempt <= 3; attempt++) {
  await dismissAgree();
  const email = page
    .locator('input[type="email"], input[name="email"], input[placeholder*="email" i]')
    .first();
  if (await email.count()) {
    await email.click();
    await page.keyboard.type('agent-testing@orvilo.aspectlylabs.com', { delay: 15 });
    const cbLabel = page.locator('text=/I have read and agree/i').first();
    if (await cbLabel.count()) {
      await cbLabel.click().catch(() => {});
      await page.waitForTimeout(900);
      await dismissAgree();
    }
    await page
      .getByRole('button', { name: /next|下一步|继续/i })
      .first()
      .click()
      .catch(() => {});
    await page.waitForTimeout(4000);
    const pwd = page.locator('input[type="password"]').first();
    if (await pwd.count()) {
      await pwd.click();
      await page.keyboard.type('TestPassword123!', { delay: 15 });
      await page
        .getByRole('button', { name: /sign in|log in|登录|submit|next|继续/i })
        .first()
        .click();
      await page.waitForTimeout(7000);
    }
  }
  if (!page.url().includes('/signin')) break;
}
say('post-login URL:', page.url());

await page.goto('http://localhost:3010/agent-testing/teams/team_cLY7tmARmiU6?tab=triage', {
  waitUntil: 'domcontentloaded',
  timeout: 30000,
});
for (let i = 0; i < 25; i++) {
  await page.waitForTimeout(2000);
  const s = await page
    .evaluate(
      () =>
        /PARITY-\d/.test(document.body?.innerText || '') ||
        /Nothing.*triage|Nothing waiting/i.test(document.body?.innerText || ''),
    )
    .catch(() => false);
  if (s) break;
}
say('URL:', page.url());
await page.screenshot({ path: `${DIR}/orvilo-triage-populated.png` }).catch(() => {});

// FLAT dump: every visible element carrying text/role/aria, deduped
const flat = await page.evaluate(() => {
  const out = [];
  const seen = new Set();
  for (const el of document.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0 || r.top > 900) continue;
    const tag = el.tagName.toLowerCase();
    const role = el.getAttribute('role');
    const aria = el.getAttribute('aria-label');
    const title = el.getAttribute('title');
    const disabled =
      el.getAttribute('disabled') !== null || el.getAttribute('aria-disabled') === 'true';
    const ownText = [...el.childNodes]
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent.trim())
      .filter(Boolean)
      .join(' ')
      .slice(0, 70);
    const interesting =
      ownText || role || aria || title || ['button', 'a', 'input', 'select', 'svg'].includes(tag);
    if (!interesting) continue;
    const key = `${tag}|${role}|${aria}|${ownText}|${Math.round(r.x)}|${Math.round(r.y)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      tag,
      role,
      aria,
      title,
      disabled,
      text: ownText,
      x: Math.round(r.x),
      y: Math.round(r.y),
      w: Math.round(r.width),
      h: Math.round(r.height),
      cls: (el.className || '').toString().slice(0, 60),
    });
  }
  return out;
});
say('=== FLAT ===');
for (const e of flat) say(JSON.stringify(e));

// hover first triage row → reveal hover actions
const row = await page.evaluate(() => {
  const a = [...document.querySelectorAll('a')].find(
    (x) => /PARITY-\d/.test(x.textContent || '') && x.getBoundingClientRect().y > 50,
  );
  if (!a) return null;
  const r = a.getBoundingClientRect();
  return [r.x, r.y, r.width, r.height];
});
say('ROW:', JSON.stringify(row));
if (row) {
  await page.mouse.move(row[0] + 200, row[1] + row[3] / 2);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${DIR}/orvilo-triage-row-hover.png` }).catch(() => {});
  const actions = await page.evaluate(() => {
    const a = [...document.querySelectorAll('a')].find(
      (x) => /PARITY-\d/.test(x.textContent || '') && x.getBoundingClientRect().y > 50,
    );
    if (!a) return null;
    let rowEl = a;
    for (let i = 0; i < 6 && rowEl.parentElement; i++) {
      rowEl = rowEl.parentElement;
      if (rowEl.querySelectorAll('button').length) break;
    }
    return [...rowEl.querySelectorAll('button, [role="button"]')].map((b) => {
      const r = b.getBoundingClientRect();
      return {
        text: b.textContent.trim().slice(0, 40),
        aria: b.getAttribute('aria-label'),
        title: b.getAttribute('title'),
        disabled: b.disabled || b.getAttribute('aria-disabled'),
        x: Math.round(r.x),
        y: Math.round(r.y),
        w: Math.round(r.width),
        h: Math.round(r.height),
      };
    });
  });
  say('=== ROW ACTIONS ===');
  say(JSON.stringify(actions));
}
await browser.close();
process.exit(0);
