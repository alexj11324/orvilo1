import { connect } from './cdp-connect.mjs';
import fs from 'fs';
const DIR = '/tmp/parity-project-detail';
const browser = await connect();
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
const result = { steps: {} };
const dump = (k, v) => {
  result.steps[k] = v;
  fs.writeFileSync(`${DIR}/orvilo-tabs.json`, JSON.stringify(result, null, 1));
};
const shot = (n) => page.screenshot({ path: `${DIR}/${n}.png` }).catch(() => {});
const waitReady = async () => {
  for (let i = 0; i < 15; i++) {
    await page.waitForTimeout(2000);
    const t = await page.evaluate(() => document.body.innerText.slice(0, 500));
    if (
      t.includes('Apollo') ||
      t.includes('Properties') ||
      t.includes('Overview') ||
      t.includes('issues')
    )
      return true;
  }
  return false;
};
try {
  // TASKS tab
  await page.goto('http://localhost:3010/agent-testing/project/prj_Pfyw7IcIBtsO/tasks', {
    waitUntil: 'domcontentloaded',
  });
  if (page.url().includes('/signin')) {
    dump('fatal', 'signin');
    process.exit(1);
  }
  await waitReady();
  dump('tasksUrl', page.url());
  await shot('orvilo-tasks-tab');
  const tasksUI = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')]
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
      .filter((b) => b.y < 200 && b.w > 0 && b.label);
    return { btns: btns.slice(0, 50) };
  });
  dump('tasksUI', tasksUI);
  dump('tasksText', (await page.evaluate(() => document.body.innerText)).slice(0, 2500));

  // ACTIVITY tab
  await page.goto('http://localhost:3010/agent-testing/project/prj_Pfyw7IcIBtsO/activity', {
    waitUntil: 'domcontentloaded',
  });
  await waitReady();
  await shot('orvilo-activity-tab');
  dump('activityText', (await page.evaluate(() => document.body.innerText)).slice(0, 3000));
  const activityUI = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')]
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
      .filter((b) => b.w > 0 && b.label)
      .slice(0, 50);
    const editors = [...document.querySelectorAll('[contenteditable],textarea')].map((e) => {
      const r = e.getBoundingClientRect();
      return {
        ph:
          e.getAttribute('placeholder') ||
          e.getAttribute('aria-label') ||
          e.getAttribute('data-placeholder'),
        x: Math.round(r.x),
        y: Math.round(r.y),
        w: Math.round(r.width),
        h: Math.round(r.height),
      };
    });
    return { btns, editors };
  });
  dump('activityUI', activityUI);

  // MILESTONES tab
  await page.goto('http://localhost:3010/agent-testing/project/prj_Pfyw7IcIBtsO/milestones', {
    waitUntil: 'domcontentloaded',
  });
  await waitReady();
  await shot('orvilo-milestones-tab');
  dump('milestonesText', (await page.evaluate(() => document.body.innerText)).slice(0, 2500));

  // GOALS route (exists but not in tab strip)
  await page.goto('http://localhost:3010/agent-testing/project/prj_Pfyw7IcIBtsO/goals', {
    waitUntil: 'domcontentloaded',
  });
  await waitReady();
  await shot('orvilo-goals-tab');
  dump('goalsUrl', page.url());
  dump('goalsText', (await page.evaluate(() => document.body.innerText)).slice(0, 1500));
  fs.writeFileSync(`${DIR}/orvilo-tabs.json`, JSON.stringify(result, null, 1));
} catch (e) {
  dump('fatal', e.message.slice(0, 700));
}
process.exit(0);
