// Re-capture Orvilo-side baselines (post re-login)
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
  ['issue-detail', 'http://localhost:3010/agent-testing/task/PMI-1/urgent-review-release-evidence'],
  ['my-issues', 'http://localhost:3010/agent-testing/my-issues'],
  ['projects-list', 'http://localhost:3010/agent-testing/projects'],
  ['project-detail', 'http://localhost:3010/agent-testing/project/prj_Pfyw7IcIBtsO'],
  ['views', 'http://localhost:3010/agent-testing/views'],
  ['view-detail', 'http://localhost:3010/agent-testing/views/svparityvol0001'],
  ['cycles', 'http://localhost:3010/agent-testing/teams/team_KNsVSioFk8hO'],
];
for (const [tag, url] of PAGES) {
  const page = await ctx.newPage();
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 40000 });
    await page.waitForTimeout(7000);
    await page.screenshot({ path: `${OUT}/before-${tag}-orvilo.png` });
    const inv = await page.evaluate(INVENTORY_JS).catch((e) => ({ error: String(e) }));
    fs.writeFileSync(
      `${OUT}/before-${tag}-orvilo.json`,
      JSON.stringify({ url: page.url(), controls: inv }, null, 1),
    );
    console.log(`OK ${tag} → ${page.url()} controls=${Array.isArray(inv) ? inv.length : 'ERR'}`);
  } catch (e) {
    console.log(`FAIL ${tag}: ${String(e).split('\n')[0]}`);
  }
  await page.close();
}
console.log('DONE');
process.exit(0);
