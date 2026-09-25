import { chromium } from 'playwright';
import fs from 'node:fs';
const OUT = '/Users/devin/repos/wt-parity-views/.agents/runtime-acceptance/parity-2026-09-23/views';
const b = await chromium.connectOverCDP('http://localhost:9222', { timeout: 120000 });
const p = await b.contexts()[0].newPage();
try {
  // discover team id from sidebar link
  await p.goto('http://localhost:3010/agent-testing/views', {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await p.waitForTimeout(6000);
  const href = await p.evaluate(() => {
    const a = [...document.querySelectorAll('a[href*="teams/"]')].find((a) =>
      /tab=|teams\/team_/.test(a.getAttribute('href') || ''),
    );
    return (
      a?.getAttribute('href') ||
      [...document.querySelectorAll('a[href*="teams"]')].map((x) => x.getAttribute('href'))
    );
  });
  fs.writeFileSync('/tmp/pv-orvteam-href.json', JSON.stringify(href));
  const teamUrl = typeof href === 'string' ? href.split('?')[0] : null;
  if (teamUrl) {
    await p.goto(`http://localhost:3010${teamUrl}?tab=views`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await p.waitForTimeout(8000);
    await p.screenshot({ path: `${OUT}/orv-team-views.png` });
    const inv = await p.evaluate(() => {
      const items = [];
      const walk = (el, d) => {
        if (d > 26 || items.length > 500) return;
        if (!el?.tagName) return;
        const tag = el.tagName.toLowerCase();
        const role = el.getAttribute?.('role');
        if (
          ['button', 'a', 'input', 'select'].includes(tag) ||
          ['button', 'link', 'tab'].includes(role)
        ) {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.height > 0 && r.x > 245)
            items.push({
              tag,
              aria: el.getAttribute('aria-label'),
              text: (el.innerText || '').trim().slice(0, 50),
              x: Math.round(r.x),
              y: Math.round(r.y),
              w: Math.round(r.width),
              h: Math.round(r.height),
            });
        }
        for (const c of el.children || []) walk(c, d + 1);
      };
      walk(document.body, 0);
      return { url: location.href, items };
    });
    fs.writeFileSync(`${OUT}/orv-team-views-dom.json`, JSON.stringify(inv, null, 1));
  }
} finally {
  await p.close();
  await b.close();
}
