import { chromium } from 'playwright';
import fs from 'node:fs';
const OUT = '/tmp/parity-views';
const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
page.setDefaultTimeout(30000);

await page.goto('http://localhost:3010/signin', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(4000);

const dumpState = async (name) => {
  const state = await page.evaluate(() => ({
    url: location.href,
    text: document.body.innerText.slice(0, 1500),
    inputs: [...document.querySelectorAll('input')].map((i) => ({
      type: i.type,
      name: i.name,
      ph: i.placeholder,
      vis: i.getBoundingClientRect().width > 0,
    })),
    buttons: [...document.querySelectorAll('button')]
      .filter((b) => b.getBoundingClientRect().width > 0)
      .map((b) => b.innerText.trim().slice(0, 40)),
  }));
  fs.writeFileSync(`${OUT}/login-${name}.json`, JSON.stringify(state, null, 2));
  console.log(`--- ${name}: ${state.url}`);
  console.log('inputs:', JSON.stringify(state.inputs));
  console.log('buttons:', JSON.stringify(state.buttons));
};

await dumpState('step0');
// Agree modal?
const agree = page.getByRole('button', { name: /agree and continue/i });
if (await agree.count()) {
  await agree.first().click();
  await page.waitForTimeout(1000);
  await dumpState('step0b');
}

const email = page
  .locator('input[type="email"], input[placeholder*="email" i], input[placeholder*="Email" i]')
  .first();
await email.click();
await email.fill('agent-testing@orvilo.aspectlylabs.com');
// checkbox
const cb = page.locator('input[type="checkbox"]').first();
if (await cb.count()) {
  await cb.check({ force: true }).catch(async () => {
    await page
      .locator('text=/agree/i')
      .first()
      .click()
      .catch(() => {});
  });
}
await page.waitForTimeout(800);
await dumpState('step1-filled');
await page.getByRole('button', { name: /next/i }).first().click();
await page.waitForTimeout(4000);
await dumpState('step2');

const pwd = page.locator('input[type="password"]').first();
if (await pwd.count()) {
  await pwd.click();
  await pwd.fill('TestPassword123!');
  await page.waitForTimeout(500);
  const btns = await page.evaluate(() =>
    [...document.querySelectorAll('button')]
      .filter((b) => b.getBoundingClientRect().width > 0)
      .map((b) => b.innerText.trim()),
  );
  console.log('pwd-step buttons:', JSON.stringify(btns));
  await page
    .getByRole('button', { name: /sign in|next|continue|log in/i })
    .first()
    .click();
  await page.waitForTimeout(7000);
  await dumpState('step3');
}
await page.goto('http://localhost:3010/agent-testing/views', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(6000);
await dumpState('final');
await page.screenshot({ path: `${OUT}/orvilo-views-dir.png` });
await page.close();
await browser.close();
console.log('DONE');
