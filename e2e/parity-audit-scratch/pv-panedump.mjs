import { chromium } from 'playwright';
import fs from 'node:fs';
const b = await chromium.connectOverCDP('http://localhost:9222', { timeout: 120000 });
const p = await b.contexts()[0].newPage();
try {
  await p.goto('http://localhost:3010/agent-testing/views/svparityvol0001', {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await p.waitForTimeout(11000);
  const data = await p.evaluate(() => {
    const pane = document.querySelector('aside[aria-label="View details"]');
    if (!pane) return { err: 'no pane' };
    const btns = [...pane.querySelectorAll('button')].map((x) => ({
      aria: x.getAttribute('aria-label'),
      text: (x.innerText || '').trim().slice(0, 50),
      x: Math.round(x.getBoundingClientRect().x),
      y: Math.round(x.getBoundingClientRect().y),
      w: Math.round(x.getBoundingClientRect().width),
    }));
    return {
      rect: pane.getBoundingClientRect().toJSON(),
      text: pane.innerText.slice(0, 2000),
      btns,
    };
  });
  fs.writeFileSync('/tmp/pv-panedump.json', JSON.stringify(data, null, 1));
} finally {
  await p.close();
  await b.close();
}
