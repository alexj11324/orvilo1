import { connect } from './cdp-connect.mjs';
import fs from 'fs';
const DIR = '/tmp/parity-project-detail';
const browser = await connect();
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
const result = { steps: {} };
const dump = (k, v) => {
  result.steps[k] = v;
  fs.writeFileSync(`${DIR}/orvilo-probe.json`, JSON.stringify(result, null, 1));
};
try {
  await page.goto('http://localhost:3010/agent-testing/project/prj_Pfyw7IcIBtsO', {
    waitUntil: 'load',
    timeout: 30000,
  });
  for (let i = 0; i < 15; i++) {
    await page.waitForTimeout(2000);
    const t = await page.evaluate(() => document.body.innerText.slice(0, 400));
    if (t && (t.includes('Overview') || t.includes('Properties') || t.includes('Apollo'))) break;
  }
  dump('url', page.url());
  await page.screenshot({ path: `${DIR}/orvilo-overview-top.png` });

  // tab strip + header
  const tabs = await page.evaluate(() => {
    const links = [...document.querySelectorAll('a')];
    return links
      .map((a) => {
        const r = a.getBoundingClientRect();
        return {
          href: a.getAttribute('href'),
          text: a.textContent.trim().slice(0, 60),
          x: Math.round(r.x),
          y: Math.round(r.y),
          w: Math.round(r.width),
          h: Math.round(r.height),
          cur: a.getAttribute('aria-current'),
        };
      })
      .filter((t) => t.y > 40 && t.y < 240 && t.w > 0);
  });
  dump('tabs', tabs);

  const headerBtns = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    return btns
      .map((b) => {
        const r = b.getBoundingClientRect();
        return {
          label: b.getAttribute('aria-label') || b.textContent.trim().slice(0, 50),
          x: Math.round(r.x),
          y: Math.round(r.y),
          w: Math.round(r.width),
          h: Math.round(r.height),
        };
      })
      .filter((b) => b.y < 160 && b.w > 0);
  });
  dump('headerButtons', headerBtns);

  const bodyText = await page.evaluate(() => document.body.innerText);
  dump('bodyText', bodyText.slice(0, 6000));

  await page.screenshot({ path: `${DIR}/orvilo-overview-full.png`, fullPage: true });
} catch (e) {
  dump('fatal', e.message);
}
fs.writeFileSync(`${DIR}/orvilo-probe.json`, JSON.stringify(result, null, 1));
