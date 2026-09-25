import { chromium } from 'playwright';
import fs from 'node:fs';
const OUT = '/Users/devin/repos/wt-parity-views/.agents/runtime-acceptance/parity-2026-09-23/views';
const b = await chromium.connectOverCDP('http://localhost:9222', { timeout: 120000 });
const p = await b.contexts()[0].newPage();
try {
  await p.goto('http://localhost:3010/agent-testing/views/svparityvol0001', {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await p.waitForTimeout(9000);
  const data = await p.evaluate(() => {
    const asides = [...document.querySelectorAll('aside')].map((a) => ({
      aria: a.getAttribute('aria-label'),
      rect: a.getBoundingClientRect().toJSON(),
      text: a.innerText.slice(0, 1600),
    }));
    // title area: what's near "Parity: Active board" in the header — editable?
    const headerArea = document.querySelector('main') || document.body;
    const editable = [...headerArea.querySelectorAll('[contenteditable]')].map((e) => ({
      ce: e.getAttribute('contenteditable'),
      text: e.innerText.slice(0, 60),
      rect: e.getBoundingClientRect().toJSON(),
    }));
    return { asides: asides.map((a) => ({ ...a, text: a.text.slice(0, 1200) })), editable };
  });
  fs.writeFileSync('/tmp/pv-orvpane.json', JSON.stringify(data, null, 1));
  await p.screenshot({ path: `${OUT}/orv-detail-full.png` });
} finally {
  await p.close();
  await b.close();
}
