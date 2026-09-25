import { chromium } from 'playwright';
import fs from 'fs';
const DIR = '/tmp/parity-project-detail';
const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
const result = { steps: [] };
const dump = (k, v) => {
  result.steps.push({ k, v });
  fs.writeFileSync(`${DIR}/linear-overview-probe.json`, JSON.stringify(result, null, 1));
};
try {
  await page.goto(
    'https://linear.app/bdiverifier/project/orvilo-linear-parity-3eb13143d468/overview',
    { waitUntil: 'load', timeout: 30000 },
  );
  for (let i = 0; i < 15; i++) {
    await page.waitForTimeout(2000);
    const t = await page.evaluate(() => document.body.innerText.slice(0, 300));
    if (t && !t.startsWith('Loading') && t.includes('Overview')) break;
  }
  await page.screenshot({ path: `${DIR}/linear-overview-top.png` });
  dump('url', page.url());

  // === TAB STRIP ===
  const tabs = await page.evaluate(() => {
    // find the nav/tab strip under the header
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
          active:
            a.getAttribute('data-active') ??
            a.getAttribute('aria-current') ??
            a.className.slice(0, 40),
        };
      })
      .filter((t) => t.y > 60 && t.y < 220);
  });
  dump('tabs', tabs);

  // === HEADER BUTTONS ===
  const headerBtns = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    return btns
      .map((b) => {
        const r = b.getBoundingClientRect();
        return {
          label: b.getAttribute('aria-label') || b.textContent.trim().slice(0, 40),
          x: Math.round(r.x),
          y: Math.round(r.y),
          w: Math.round(r.width),
          h: Math.round(r.height),
        };
      })
      .filter((b) => b.y < 140 && b.w > 0);
  });
  dump('headerButtons', headerBtns);

  // === FULL PAGE TEXT (for section enumeration) ===
  const bodyText = await page.evaluate(() => document.body.innerText);
  dump('bodyText', bodyText.slice(0, 6000));

  // === RIGHT SIDE / PROPERTIES ===
  const props = await page.evaluate(() => {
    const find = (txt) =>
      [...document.querySelectorAll('*')].filter(
        (e) => e.children.length === 0 && e.textContent.trim() === txt,
      );
    const out = {};
    for (const label of [
      'Properties',
      'Status',
      'Priority',
      'Lead',
      'Members',
      'Start date',
      'Target date',
      'Teams',
      'Labels',
      'Resources',
      'Milestones',
      'Progress',
      'Updates',
      'Activity',
      'Description',
    ]) {
      const els = find(label);
      out[label] = els.map((e) => {
        const r = e.getBoundingClientRect();
        return {
          x: Math.round(r.x),
          y: Math.round(r.y),
          w: Math.round(r.width),
          h: Math.round(r.height),
          tag: e.tagName,
        };
      });
    }
    return out;
  });
  dump('sectionLabels', props);

  await page.screenshot({ path: `${DIR}/linear-overview-full.png`, fullPage: true });
} catch (e) {
  dump('error', e.message + '\n' + e.stack);
}
fs.writeFileSync(`${DIR}/linear-overview-probe.json`, JSON.stringify(result, null, 1));
