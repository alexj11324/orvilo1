import { connect } from './cdp-connect.mjs';
import fs from 'fs';
const DIR = '/tmp/parity-project-detail';
const browser = await connect();
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
const result = { steps: {} };
const dump = (k, v) => {
  result.steps[k] = v;
  fs.writeFileSync(`${DIR}/orvilo-full.json`, JSON.stringify(result, null, 1));
};
const shot = (n) => page.screenshot({ path: `${DIR}/${n}.png` }).catch(() => {});
const ensureAuth = async () => {
  for (let i = 0; i < 8; i++) {
    if (!page.url().includes('/signin')) return true;
    await page.waitForTimeout(3000);
    await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(4000);
  }
  return !page.url().includes('/signin');
};
try {
  await page.goto('http://localhost:3010/agent-testing/project/prj_Pfyw7IcIBtsO/overview', {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForTimeout(8000);
  if (!(await ensureAuth())) {
    dump('fatal', 'still at signin: ' + page.url());
    process.exit(1);
  }
  // wait for project content
  for (let i = 0; i < 12; i++) {
    const t = await page.evaluate(() => document.body.innerText.slice(0, 600));
    if (t.includes('Apollo') || t.includes('Properties') || t.includes('Overview')) break;
    await page.waitForTimeout(2000);
  }
  dump('url', page.url());
  await shot('orvilo-overview-top');
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
      .filter((t) => t.w > 0 && t.y < 240);
  });
  dump('tabs', tabs);
  const headerBtns = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    return btns
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
      .filter((b) => b.y < 160 && b.w > 0);
  });
  dump('headerButtons', headerBtns);
  dump('bodyText', (await page.evaluate(() => document.body.innerText)).slice(0, 6000));
  // right rail labels
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
      'Dates',
      'Teams',
      'Labels',
      'Resources',
      'Milestones',
      'Progress',
      'Activity',
      'Description',
      'Slack',
    ]) {
      out[label] = find(label).map((e) => {
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
  await shot('orvilo-overview-full');
  fs.writeFileSync(`${DIR}/orvilo-full.json`, JSON.stringify(result, null, 1));
} catch (e) {
  dump('fatal', e.message.slice(0, 700));
}
process.exit(0);
