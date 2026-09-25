import { chromium } from 'playwright';
import fs from 'node:fs';
const b = await chromium.connectOverCDP('http://localhost:9222', { timeout: 120000 });
const p = await b.contexts()[0].newPage();
try {
  await p.goto('http://localhost:3010/agent-testing/views/svparityvol0001', {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await p.waitForTimeout(10000);
  const data = await p.evaluate(() => ({
    nAsides: document.querySelectorAll('aside').length,
    asideArias: [...document.querySelectorAll('aside')].map((a) => a.getAttribute('aria-label')),
    closeBtnExists: !!document.querySelector(
      'button[aria-label*="view details" i], button[title*="view details" i]',
    ),
    closeBtnLabel: document
      .querySelector('button[aria-label*="details" i]')
      ?.getAttribute('aria-label'),
    detailPaneEls: [...document.querySelectorAll('[class*=detailPane]')].map((e) =>
      e.getBoundingClientRect().toJSON(),
    ),
    bodyHasPane: document.body.innerHTML.includes('View details'),
  }));
  fs.writeFileSync('/tmp/pv-panecheck.json', JSON.stringify(data));
} finally {
  await p.close();
  await b.close();
}
