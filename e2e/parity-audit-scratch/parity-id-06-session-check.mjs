// Check session state: cookies + localStorage + what other tabs show.
import { chromium } from 'playwright';
import fs from 'node:fs';
const OUT = '/tmp/parity-audit-2026-09-23/issue-detail';
const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const pages = ctx.pages().map((p) => p.url());
fs.writeFileSync(`${OUT}/tabs.json`, JSON.stringify(pages, null, 1));
const cookies = await ctx.cookies('http://localhost:3010');
fs.writeFileSync(
  `${OUT}/cookies.json`,
  JSON.stringify(
    cookies.map((c) => ({ name: c.name, domain: c.domain, path: c.path, expires: c.expires })),
    null,
    1,
  ),
);
process.exit(0);
