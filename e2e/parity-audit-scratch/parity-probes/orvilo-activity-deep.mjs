import { connect } from './cdp-connect.mjs';
import fs from 'fs';
const DIR = '/tmp/parity-project-detail';
const browser = await connect();
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
const result = {};
try {
  await page.goto('http://localhost:3010/agent-testing/project/prj_Pfyw7IcIBtsO/activity', {
    waitUntil: 'domcontentloaded',
  });
  // poll up to 30s for main column content (composer editor or feed text)
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(1500);
    const st = await page.evaluate(() => {
      const eds = [...document.querySelectorAll('[contenteditable="true"],textarea')].map((e) => {
        const r = e.getBoundingClientRect();
        return {
          ph: e.getAttribute('placeholder') || e.getAttribute('data-placeholder'),
          x: Math.round(r.x),
          y: Math.round(r.y),
          w: Math.round(r.width),
          h: Math.round(r.height),
        };
      });
      const main = document.querySelector('main') || document.body;
      // find region between x 240 and 800
      const errs = [...document.querySelectorAll('*')]
        .filter((e) => e.children.length === 0 && /error|retry|failed/i.test(e.textContent))
        .map((e) => e.textContent.trim().slice(0, 80))
        .slice(0, 5);
      return { eds, errs, len: document.body.innerText.length };
    });
    result[`poll${i}`] = st;
    if (st.eds.length > 0 || i === 19) break;
  }
  result.url = page.url();
  result.bodyEnd = (await page.evaluate(() => document.body.innerText)).slice(-1500);
  const btns = await page.evaluate(() =>
    [...document.querySelectorAll('button,[role="tab"]')]
      .map((b) => {
        const r = b.getBoundingClientRect();
        return {
          label: (b.getAttribute('aria-label') || b.title || b.textContent || '')
            .trim()
            .slice(0, 60),
          x: Math.round(r.x),
          y: Math.round(r.y),
          w: Math.round(r.width),
          h: Math.round(r.height),
        };
      })
      .filter((b) => b.x > 240 && b.x < 800 && b.w > 0),
  );
  result.mainColBtns = btns;
  await page.screenshot({ path: `${DIR}/orvilo-activity-deep.png` });
} catch (e) {
  result.fatal = e.message.slice(0, 500);
}
fs.writeFileSync(`${DIR}/orvilo-activity-deep.json`, JSON.stringify(result, null, 1));
process.exit(0);
