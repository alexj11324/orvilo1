import { connect } from './cdp-connect.mjs';
import fs from 'fs';
const DIR = '/tmp/parity-project-detail';
const browser = await connect();
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
const result = { steps: {} };
const dump = (k, v) => {
  result.steps[k] = v;
  fs.writeFileSync(`${DIR}/linear-proj2.json`, JSON.stringify(result, null, 1));
};
try {
  // PasteBuddy has 42 issues 98% — likely has milestones
  await page.goto(
    'https://linear.app/bdiverifier/project/pastebuddy-pasteapp-feature-parity-e98b0f9f1850/overview',
    { waitUntil: 'load', timeout: 30000 },
  );
  for (let i = 0; i < 15; i++) {
    await page.waitForTimeout(2000);
    const t = await page.evaluate(() => document.body.innerText.slice(0, 300));
    if (t && !t.startsWith('Loading') && t.includes('Overview')) break;
  }
  dump('url', page.url());
  const tabs = await page.evaluate(() => {
    const links = [...document.querySelectorAll('a[href*="/project/"]')];
    return links
      .map((a) => {
        const r = a.getBoundingClientRect();
        return {
          href: a.getAttribute('href'),
          text: a.textContent.trim(),
          x: Math.round(r.x),
          y: Math.round(r.y),
          w: Math.round(r.width),
          h: Math.round(r.height),
          active: a.getAttribute('data-active'),
        };
      })
      .filter((t) => t.y > 40 && t.y < 200 && t.w > 0);
  });
  dump('tabs', tabs);
  await page.screenshot({ path: `${DIR}/linear-proj2-overview.png` });
  dump('bodyText', (await page.evaluate(() => document.body.innerText)).slice(0, 5000));
  // milestone rail rows
  const rail = await page.evaluate(() => {
    const hdr = [...document.querySelectorAll('span,div,h3')].find(
      (e) =>
        e.children.length === 0 &&
        e.textContent.trim() === 'Milestones' &&
        e.getBoundingClientRect().x > 700,
    );
    if (!hdr) return null;
    let card = hdr;
    for (let i = 0; i < 6 && card.parentElement; i++) card = card.parentElement;
    const rows = [...card.querySelectorAll('a,button,[role="button"]')].map((e) => {
      const r = e.getBoundingClientRect();
      return {
        tag: e.tagName,
        role: e.getAttribute('role'),
        aria: e.getAttribute('aria-label'),
        text: e.textContent.trim().slice(0, 60),
        href: e.getAttribute('href'),
        x: Math.round(r.x),
        y: Math.round(r.y),
        w: Math.round(r.width),
        h: Math.round(r.height),
      };
    });
    return { text: card.innerText.slice(0, 900), rows };
  });
  dump('milestoneRail', rail);
} catch (e) {
  dump('fatal', e.message.slice(0, 600));
}
fs.writeFileSync(`${DIR}/linear-proj2.json`, JSON.stringify(result, null, 1));
process.exit(0);
