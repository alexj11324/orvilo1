import { connect } from './cdp-connect.mjs';
import fs from 'fs';
const browser = await connect();
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
const log = [];
try {
  await page.goto('http://localhost:3010/agent-testing/settings/labs', {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForTimeout(8000);
  log.push('url: ' + page.url());
  const text = await page.evaluate(() => document.body.innerText.slice(0, 2500));
  log.push('text: ' + text);
  // enumerate switches
  const switches = await page.evaluate(() => {
    return [
      ...document.querySelectorAll('button[role="switch"], .ant-switch, input[type="checkbox"]'),
    ].map((el, i) => {
      const r = el.getBoundingClientRect();
      // find nearby label text
      let label = '';
      let n = el;
      for (let up = 0; up < 6 && n.parentElement; up++) {
        n = n.parentElement;
        label = n.innerText?.slice(0, 80) || label;
        if (label && label.length > 3) break;
      }
      return {
        i,
        x: Math.round(r.x),
        y: Math.round(r.y),
        checked: el.getAttribute('aria-checked') ?? el.className.includes('checked'),
        label,
      };
    });
  });
  log.push('switches: ' + JSON.stringify(switches));
  fs.writeFileSync(
    '/tmp/parity-project-detail/labs.json',
    JSON.stringify({ log: log.join('\n'), switches }, null, 1),
  );
  await page.screenshot({ path: '/tmp/parity-project-detail/orvilo-labs.png' });
  // toggle the projects switch on if off
  const projIdx = switches.findIndex((s) => /project/i.test(s.label));
  if (projIdx >= 0 && String(switches[projIdx].checked) !== 'true') {
    const sw = page.locator('button[role="switch"], .ant-switch').nth(projIdx);
    await sw.click();
    await page.waitForTimeout(2000);
    log.push('toggled projects ON');
    await page.screenshot({ path: '/tmp/parity-project-detail/orvilo-labs-after.png' });
  }
  fs.writeFileSync(
    '/tmp/parity-project-detail/labs.json',
    JSON.stringify({ log: log.join('\n'), switches }, null, 1),
  );
} catch (e) {
  fs.writeFileSync(
    '/tmp/parity-project-detail/labs.json',
    'ERR ' + e.message + '\n' + log.join('\n'),
  );
}
process.exit(0);
