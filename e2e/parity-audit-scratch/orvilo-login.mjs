// Robust Orvilo login — types into hydrated controlled inputs, verifies values
import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://localhost:9222', { timeout: 120000 });
const ctx = browser.contexts()[0];

let page = ctx.pages().find((p) => p.url().includes('localhost:3010'));
if (!page) page = await ctx.newPage();
await page.bringToFront().catch(() => {});

async function dismissAgreeModal() {
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
}

for (let attempt = 1; attempt <= 3; attempt++) {
  console.log(`--- attempt ${attempt}`);
  await page.goto('http://localhost:3010/signin', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000); // let React hydrate fully
  await dismissAgreeModal();

  // EMAIL step — type, don't fill (controlled input needs real keystrokes)
  const email = page
    .locator('input[type="email"], input[name="email"], input[placeholder*="email" i]')
    .first();
  await email.click();
  await page.keyboard.type('agent-testing@orvilo.aspectlylabs.com', { delay: 20 });
  const gotEmail = await email.inputValue().catch(() => '');
  console.log('email field =', gotEmail);
  if (!gotEmail.includes('agent-testing')) {
    await page.waitForTimeout(2000);
    continue;
  }

  // tick T&C checkbox (label click triggers modal → agree)
  const cbLabel = page.locator('text=/I have read and agree/i').first();
  if (await cbLabel.count()) {
    await cbLabel.click().catch(() => {});
    await page.waitForTimeout(900);
  }
  await dismissAgreeModal();

  await page
    .getByRole('button', { name: /next|下一步|继续/i })
    .first()
    .click();
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `/tmp/orvilo-login-a${attempt}.png` });
  console.log('post-email URL:', page.url());

  // PASSWORD step
  const pwd = page.locator('input[type="password"]').first();
  if ((await pwd.count()) && (await pwd.isVisible().catch(() => false))) {
    await pwd.click();
    await page.keyboard.type('TestPassword123!', { delay: 20 });
    const gotPwd = await pwd.inputValue().catch(() => '');
    console.log('pwd len =', gotPwd.length);
    if (!gotPwd) continue;
    await page
      .getByRole('button', { name: /sign in|log in|登录|submit|next|继续/i })
      .first()
      .click();
    await page.waitForTimeout(7000);
    console.log('post-password URL:', page.url());
    if (!page.url().includes('/signin')) break;
  }
}

await page.goto('http://localhost:3010/agent-testing/tasks', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(6000);
console.log('FINAL URL:', page.url());
await page.screenshot({ path: '/tmp/orvilo-tasks.png' });
process.exit(0);
