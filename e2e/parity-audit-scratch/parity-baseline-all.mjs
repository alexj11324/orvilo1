// Capture BEFORE baseline screenshots + control inventories for all 8 pages
import { chromium } from 'playwright';
import fs from 'node:fs';

const OUT = '/tmp/parity-verify';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];

const INVENTORY_JS = `(() => {
  const els = [...document.querySelectorAll('a[href], button, [role="button"], [role="tab"], [role="menuitem"], [role="checkbox"], [role="switch"], input, [contenteditable="true"]')];
  return els.filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
    .map(e => ({ tag: e.tagName.toLowerCase(), role: e.getAttribute('role'), text: (e.innerText || e.value || e.getAttribute('placeholder') || '').trim().slice(0, 60), aria: e.getAttribute('aria-label'), href: e.getAttribute('href') }));
})()`;

const PAGES = [
  ['issue-detail', 'https://linear.app/bdiverifier/issue/ORV-115', null],
  [
    'my-issues',
    'https://linear.app/bdiverifier/my-issues/assigned',
    'http://localhost:3010/agent-testing/my-issues',
  ],
  [
    'triage',
    'https://linear.app/bdiverifier/team/ORV/triage',
    'http://localhost:3010/agent-testing/teams/team_KNsVSioFk8hO?tab=triage',
  ],
  [
    'projects-list',
    'https://linear.app/bdiverifier/projects/all',
    'http://localhost:3010/agent-testing/projects',
  ],
  [
    'project-detail',
    'https://linear.app/bdiverifier/project/orvilo-linear-parity-3eb13143d468/overview',
    'http://localhost:3010/agent-testing/project/prj_Pfyw7IcIBtsO',
  ],
  [
    'views',
    'https://linear.app/bdiverifier/views/issues',
    'http://localhost:3010/agent-testing/views',
  ],
  [
    'view-detail',
    'https://linear.app/bdiverifier/view/all-issues-3320169ce6ab',
    'http://localhost:3010/agent-testing/views/svparityvol0001',
  ],
  [
    'cycles',
    'https://linear.app/bdiverifier/team/ORV/cycles',
    'http://localhost:3010/agent-testing/teams/team_KNsVSioFk8hO',
  ],
];

// find a real Orvilo task detail URL from the tasks board
const probe = await ctx.newPage();
await probe.goto('http://localhost:3010/agent-testing/tasks', { waitUntil: 'domcontentloaded' });
await probe.waitForTimeout(6000);
const taskLinks = await probe.$$eval('a[href*="/task/"]', (as) =>
  as.slice(0, 5).map((a) => a.getAttribute('href')),
);
console.log('orvilo task links:', JSON.stringify(taskLinks));
if (taskLinks.length) PAGES[0][2] = 'http://localhost:3010' + taskLinks[0];
await probe.close();

for (const [tag, linUrl, orvUrl] of PAGES) {
  for (const [name, url] of [
    ['linear', linUrl],
    ['orvilo', orvUrl],
  ]) {
    if (!url) continue;
    const page = await ctx.newPage();
    try {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(6000);
      await page.screenshot({ path: `${OUT}/before-${tag}-${name}.png` });
      const inv = await page.evaluate(INVENTORY_JS).catch((e) => ({ error: String(e) }));
      fs.writeFileSync(
        `${OUT}/before-${tag}-${name}.json`,
        JSON.stringify({ url: page.url(), controls: inv }, null, 1),
      );
      console.log(
        `OK ${tag} ${name} → ${page.url()} controls=${Array.isArray(inv) ? inv.length : 'ERR'}`,
      );
    } catch (e) {
      console.log(`FAIL ${tag} ${name}: ${String(e).split('\n')[0]}`);
    }
    await page.close();
  }
}
console.log('ALL DONE');
process.exit(0);
