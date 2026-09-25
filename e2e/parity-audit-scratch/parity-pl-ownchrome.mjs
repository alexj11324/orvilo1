/* Orvilo audit on private Chrome :9333 — login, enable labs, audit /projects. */
import fs from 'node:fs';
import { chromium } from 'playwright';

const OUT = '/tmp/parity-audit-2026-09-23/projects-list';
fs.mkdirSync(OUT, { recursive: true });
const CDP = 'http://127.0.0.1:9333';
const base = process.argv[2] || 'http://localhost:3010';
const prefix = process.argv[3] || 'orvilo';

const browser = await chromium.connectOverCDP(CDP, { timeout: 30000 });
const ctx = browser.contexts()[0];
const page = ctx.pages()[0] || (await ctx.newPage());
await page.setViewportSize({ width: 1440, height: 900 });

const clickAt = async (find) => {
  const box = await page.evaluate(find);
  if (!box) return false;
  await page.mouse.click(box.x, box.y);
  return true;
};

// login
try {
  await page.goto(`${base}/signin`, { waitUntil: 'commit', timeout: 20000 });
} catch {}
await page.bringToFront().catch(() => {});
await page.waitForTimeout(7000);
if (page.url().includes('/signin')) {
  console.log('logging in...');
  const emailBox = await page.evaluate(() => {
    const el = [...document.querySelectorAll('input')].find((i) =>
      /mail|email|username/i.test(i.placeholder || ''),
    );
    const r = el?.getBoundingClientRect();
    return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
  });
  if (emailBox) {
    await page.mouse.click(emailBox.x, emailBox.y);
    await page.waitForTimeout(300);
    await page.keyboard.type('agent-testing@orvilo.aspectlylabs.com', { delay: 8 });
  }
  await clickAt(() => {
    const el = [...document.querySelectorAll('button')].find((b) =>
      /^(next|下一步|继续)$/i.test((b.innerText || '').trim()),
    );
    const r = el?.getBoundingClientRect();
    return r && r.width ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
  });
  await page.waitForTimeout(4500);
  const pwdBox = await page.evaluate(() => {
    const el = document.querySelector('input[type="password"]');
    const r = el?.getBoundingClientRect();
    return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
  });
  if (pwdBox) {
    await page.mouse.click(pwdBox.x, pwdBox.y);
    await page.waitForTimeout(300);
    await page.keyboard.type('TestPassword123!', { delay: 8 });
    await clickAt(() => {
      const el = [...document.querySelectorAll('button')].find(
        (b) =>
          b.type === 'submit' || /sign in|log in|登录|next|继续/i.test((b.innerText || '').trim()),
      );
      const r = el?.getBoundingClientRect();
      return r && r.width ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
    });
    await page.waitForTimeout(9000);
  }
  console.log('after login:', page.url());
}

// enable projects lab via settings page
try {
  await page.goto(`${base}/agent-testing/settings/labs`, {
    waitUntil: 'commit',
    timeout: 20000,
  });
} catch {}
await page.waitForTimeout(7000);
console.log('labs url:', page.url());
const switches = await page.evaluate(() => {
  return [...document.querySelectorAll('[role="switch"], input[type="checkbox"]')]
    .map((el) => {
      const r = el.getBoundingClientRect();
      let row = el;
      for (let i = 0; i < 6 && row.parentElement; i++) {
        row = row.parentElement;
        const txt = (row.innerText || '').trim();
        if (txt.length > 5 && txt.length < 300) break;
      }
      return {
        checked: String(el.getAttribute('aria-checked') ?? el.checked),
        label: (row.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 90),
        x: Math.round(r.x),
        y: Math.round(r.y),
      };
    })
    .filter((c) => c.y > 0);
});
console.log('SWITCHES:', JSON.stringify(switches, null, 1));
const projSwitch = switches.find((s) => /project/i.test(s.label));
if (projSwitch && projSwitch.checked !== 'true') {
  await page.mouse.click(projSwitch.x + 8, projSwitch.y + 8);
  await page.waitForTimeout(2000);
  console.log('clicked project lab switch');
} else {
  console.log('project switch:', JSON.stringify(projSwitch));
}

// audit projects page
try {
  await page.goto(`${base}/agent-testing/projects`, { waitUntil: 'commit', timeout: 20000 });
} catch {}
await page.waitForTimeout(8000);
console.log('projects url:', page.url());
await page.screenshot({ path: `${OUT}/${prefix}-projects.png` });
const controls = await page.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll(
    'button, a[href], input, [role="button"], [role="combobox"], [role="tab"], [role="switch"], [role="checkbox"]',
  )) {
    const r = el.getBoundingClientRect();
    if (r.width === 0) continue;
    out.push({
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute('role'),
      label:
        el.getAttribute('aria-label') ||
        el.getAttribute('title') ||
        (el.innerText || el.value || el.placeholder || '').replace(/\s+/g, ' ').trim().slice(0, 80),
      x: Math.round(r.x),
      y: Math.round(r.y),
      w: Math.round(r.width),
      h: Math.round(r.height),
      href: el.getAttribute('href') || undefined,
      disabled: el.disabled || el.getAttribute('aria-disabled') || undefined,
    });
  }
  return out;
});
fs.writeFileSync(`${OUT}/${prefix}-controls.json`, JSON.stringify(controls, null, 2));
console.log('== CONTROLS (x>240, y<700) ==');
for (const c of controls.filter((c) => c.x > 240 && c.y < 700)) {
  console.log(
    `${String(c.y).padStart(4)},${String(c.x).padStart(4)} ${c.tag}[${c.role || ''}] "${c.label}" ${c.w}x${c.h}${c.disabled ? ' DISABLED' : ''}${c.href ? ' ->' + c.href : ''}`,
  );
}
await page.close();
await browser.close();
console.log('DONE');
