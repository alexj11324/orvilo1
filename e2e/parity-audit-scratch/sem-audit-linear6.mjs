import { connect } from './_cdp.mjs';
import { writeFileSync } from 'node:fs';

const out = [];
const log = (...a) => {
  out.push(a.join(' '));
  writeFileSync('/tmp/sem-linear6.log', out.join('\n'));
};

try {
  const browser = await connect(4);
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find((p) => p.url().includes('linear.app'));
  if (!page) {
    log('NO LINEAR TAB');
    process.exit(0);
  }
  await page.bringToFront();
  await page.goto('https://linear.app/bdiverifier/my-issues/assigned', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
  await page.waitForTimeout(8000);
  log('URL:', page.url());

  const btn = page.locator('[aria-label="Display options"]').first();
  const count = await btn.count();
  log('display-options buttons:', count);
  if (count > 0) {
    await btn.click({ timeout: 5000 });
    await page.waitForTimeout(2500);
    const dump = await page.evaluate(() => {
      const all = [...document.querySelectorAll('body *')];
      const pop = all.filter(
        (el) =>
          el.children.length > 0 &&
          el.innerText &&
          /ordering|grouping|sub-?issues|completed|triage/i.test(el.innerText) &&
          el.getBoundingClientRect().width > 100 &&
          getComputedStyle(el).position === 'fixed',
      );
      return pop
        .map((el) => el.innerText)
        .join('\n====\n')
        .slice(0, 5000);
    });
    log('POPUP:', dump || '(empty)');
    await page.screenshot({ path: '/tmp/linear-myissues-displayopts.png' });
    await page.keyboard.press('Escape');
  }
} catch (e) {
  log('ERR', e.message);
}
process.exit(0);
