// Grab real Linear issue + project URLs for baseline captures
import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const page = await ctx.newPage();

// issues list → first issue link
await page.goto('https://linear.app/bdiverifier/team/ORV/all', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(5000);
const issues = await page.$$eval('a[href*="/issue/"]', (as) =>
  as.slice(0, 8).map((a) => ({
    href: a.getAttribute('href'),
    text: (a.textContent || '').trim().slice(0, 60),
  })),
);
console.log('ISSUES:', JSON.stringify(issues, null, 1));

// projects list → first project link
await page.goto('https://linear.app/bdiverifier/projects/all', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(5000);
const projs = await page.$$eval('a[href*="/project/"]', (as) =>
  as.slice(0, 8).map((a) => ({
    href: a.getAttribute('href'),
    text: (a.textContent || '').trim().slice(0, 60),
  })),
);
console.log('PROJECTS:', JSON.stringify(projs, null, 1));

// views dir → view links
await page.goto('https://linear.app/bdiverifier/views/issues', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(5000);
const views = await page.$$eval('a[href*="/view/"], a[href*="/views/"]', (as) =>
  as.slice(0, 10).map((a) => ({
    href: a.getAttribute('href'),
    text: (a.textContent || '').trim().slice(0, 60),
  })),
);
console.log('VIEWS:', JSON.stringify(views, null, 1));

// cycles reachability
await page.goto('https://linear.app/bdiverifier/team/ORV/cycles', {
  waitUntil: 'domcontentloaded',
});
await page.waitForTimeout(4000);
console.log('CYCLES URL:', page.url(), '|', await page.title());
process.exit(0);
