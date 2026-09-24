import { connect } from './cdp-connect.mjs';
import fs from 'fs';
const DIR = '/tmp/parity-project-detail';
const browser = await connect();
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
const result = { steps: {} };
const dump = (k, v) => {
  result.steps[k] = v;
  fs.writeFileSync(`${DIR}/linear-tabs.json`, JSON.stringify(result, null, 1));
};
const shot = (n) => page.screenshot({ path: `${DIR}/${n}.png` }).catch(() => {});
const waitReady = async (marker) => {
  for (let i = 0; i < 15; i++) {
    await page.waitForTimeout(2000);
    const t = await page.evaluate(() => document.body.innerText.slice(0, 400));
    if (t && !t.startsWith('Loading') && t.includes(marker)) return true;
  }
  return false;
};
try {
  // ===== ISSUES TAB =====
  await page.goto(
    'https://linear.app/bdiverifier/project/orvilo-linear-parity-3eb13143d468/issues',
    { waitUntil: 'load', timeout: 30000 },
  );
  await waitReady('Issues');
  dump('issuesUrl', page.url());
  await shot('linear-issues-tab');
  const issuesUI = await page.evaluate(() => {
    const main = document.querySelector('main') || document.body;
    const btns = [...main.querySelectorAll('button')]
      .map((b) => {
        const r = b.getBoundingClientRect();
        return {
          label: (b.getAttribute('aria-label') || b.textContent || '').trim().slice(0, 60),
          x: Math.round(r.x),
          y: Math.round(r.y),
          w: Math.round(r.width),
          h: Math.round(r.height),
        };
      })
      .filter((b) => b.y < 200 && b.w > 0 && b.label);
    const links = [...main.querySelectorAll('a')]
      .map((a) => ({
        href: a.getAttribute('href'),
        text: a.textContent.trim().slice(0, 50),
        y: Math.round(a.getBoundingClientRect().y),
      }))
      .filter((a) => a.y < 200);
    return { btns: btns.slice(0, 40), links: links.slice(0, 20) };
  });
  dump('issuesUI', issuesUI);
  dump('issuesText', (await page.evaluate(() => document.body.innerText)).slice(0, 2500));

  // open Display options
  try {
    const disp = page
      .locator(
        'button:has-text("Display"), button[aria-label*="Display"], button[aria-label*="display"]',
      )
      .first();
    if (await disp.count()) {
      await disp.click();
      await page.waitForTimeout(1000);
      const m = await page.evaluate(() =>
        [
          ...document.querySelectorAll(
            '[role="menu"],[role="listbox"],[data-radix-popper-content-wrapper]',
          ),
        ].map((el) => el.innerText.slice(0, 900)),
      );
      dump('issuesDisplayMenu', m);
      await shot('linear-issues-display');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
    }
  } catch (e) {
    dump('displayErr', e.message.slice(0, 200));
  }

  // ===== ACTIVITY TAB =====
  await page.goto(
    'https://linear.app/bdiverifier/project/orvilo-linear-parity-3eb13143d468/activity',
    { waitUntil: 'load', timeout: 30000 },
  );
  await waitReady('Activity');
  await shot('linear-activity-tab');
  dump('activityText', (await page.evaluate(() => document.body.innerText)).slice(0, 3500));
  const activityUI = await page.evaluate(() => {
    const main = document.querySelector('main') || document.body;
    const btns = [...main.querySelectorAll('button')]
      .map((b) => {
        const r = b.getBoundingClientRect();
        return {
          label: (b.getAttribute('aria-label') || b.textContent || '').trim().slice(0, 60),
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
        ph: e.getAttribute('placeholder') || e.getAttribute('aria-label'),
        x: Math.round(r.x),
        y: Math.round(r.y),
        w: Math.round(r.width),
        h: Math.round(r.height),
      };
    });
    return { btns, editors };
  });
  dump('activityUI', activityUI);
  fs.writeFileSync(`${DIR}/linear-tabs.json`, JSON.stringify(result, null, 1));
} catch (e) {
  dump('fatal', e.message.slice(0, 800));
}
process.exit(0);
