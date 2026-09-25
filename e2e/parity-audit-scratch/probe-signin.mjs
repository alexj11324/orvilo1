import { chromium } from 'playwright';
import fs from 'node:fs';
const b = await chromium.launch({ headless: true });
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await p.goto('http://localhost:3010/signin', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForTimeout(5000);
await p.screenshot({ path: '/tmp/parity-audit-2026-09-23/issue-detail/signin-probe.png' });
const els = await p.evaluate(() =>
  [...document.querySelectorAll('input,button,[role="button"],a')]
    .filter((e) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    })
    .map((e) => ({
      tag: e.tagName,
      type: e.getAttribute('type'),
      ph: e.getAttribute('placeholder'),
      text: (e.innerText || '').trim().slice(0, 60),
    })),
);
console.log(JSON.stringify(els, null, 1));
console.log('URL', p.url());
console.log('BODY', (await p.evaluate(() => document.body.innerText)).slice(0, 800));
process.exit(0);
