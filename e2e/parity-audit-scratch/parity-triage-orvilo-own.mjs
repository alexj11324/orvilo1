// Orvilo audit on own headless browser — bypasses saturated shared CDP.
import { chromium } from 'playwright';
const DIR = '/tmp/parity-audit-2026-09-23/triage';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const say = (...a) => console.log(...a);

// --- login ---
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
  say(`login attempt ${attempt}, url=${page.url()}`);
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

// --- triage page, populated team ---
await page.goto('http://localhost:3010/agent-testing/teams/team_cLY7tmARmiU6?tab=triage', {
  waitUntil: 'domcontentloaded',
  timeout: 30000,
});
// wait until a row with PARITY- identifier or the empty state appears
let ok = false;
for (let i = 0; i < 20; i++) {
  await page.waitForTimeout(2000);
  const s = await page
    .evaluate(() => {
      const txt = document.body?.innerText || '';
      return {
        len: txt.length,
        hasParity: /PARITY-\d/.test(txt),
        hasEmpty: /triage/i.test(txt),
        skel: !!document.querySelector('[class*="skeleton" i]'),
      };
    })
    .catch(() => ({ err: 1 }));
  say(`t${i}: ${JSON.stringify(s)}`);
  if (s.hasParity || (s.len > 200 && !s.skel)) {
    ok = true;
    break;
  }
}
say('settled=' + ok + ' url=' + page.url());
await page.screenshot({ path: `${DIR}/orvilo-triage-populated.png` }).catch(() => {});

const dump = await page.evaluate(() => {
  const root = document.querySelector('#root, main, [class*="layout"], body');
  const out = [];
  const walk = (el, depth) => {
    if (depth > 10) return;
    const r = el.getBoundingClientRect();
    if ((r.width === 0 && r.height === 0) || r.bottom < 0 || r.top > 950) return;
    const tag = el.tagName.toLowerCase();
    const role = el.getAttribute('role');
    const aria = el.getAttribute('aria-label');
    const title = el.getAttribute('title');
    const ownText = [...el.childNodes]
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent.trim())
      .filter(Boolean)
      .join(' ')
      .slice(0, 60);
    out.push(
      `${'  '.repeat(depth)}<${tag}${role ? ` role=${role}` : ''}${aria ? ` aria="${aria}"` : ''}${title ? ` title="${title}"` : ''}> "${ownText}" [${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}]`,
    );
    for (const c of el.children) walk(c, depth + 1);
  };
  walk(root, 0);
  return out.join('\n');
});
say('=== DOM ===');
say(dump);

// hover the first row to reveal hover actions
const firstRowY = await page.evaluate(() => {
  const el = [...document.querySelectorAll('a')].find((a) => /PARITY-\d/.test(a.textContent || ''));
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return {
    rect: [r.x, r.y, r.width, r.height],
    href: el.getAttribute('href'),
    text: el.textContent.slice(0, 80),
  };
});
say('FIRST ROW LINK:', JSON.stringify(firstRowY));
if (firstRowY) {
  await page.mouse.move(firstRowY.rect[0] + firstRowY.rect[2] / 2, firstRowY.rect[1] + 5);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${DIR}/orvilo-triage-row-hover.png` }).catch(() => {});
}
await browser.close();
process.exit(0);
