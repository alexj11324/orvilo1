import { connect } from './_cdp.mjs';
import { writeFileSync } from 'node:fs';

const out = [];
const log = (...a) => {
  out.push(a.join(' '));
  writeFileSync('/tmp/sem-linear8.log', out.join('\n'));
};

let page;
try {
  const browser = await connect(4);
  const ctx = browser.contexts()[0];
  page = await ctx.newPage();
  await page.goto('https://linear.app/bdiverifier/team/ORV/active', {
    waitUntil: 'domcontentloaded',
    timeout: 45000,
  });
  await page.waitForTimeout(9000);
  log('URL:', page.url());
  const btn = page.locator('[aria-label="Display options"]').first();
  log('btn count:', await btn.count());
  if ((await btn.count()) > 0) {
    await btn.click({ timeout: 8000 });
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
        .slice(0, 4000);
    });
    log('POPUP:', dump || '(empty)');
    await page.screenshot({ path: '/tmp/linear-team-displayopts.png' });
    await page.keyboard.press('Escape');
  }
} catch (e) {
  log('ERR', e.message);
} finally {
  if (page) await page.close().catch(() => {});
}
process.exit(0);
