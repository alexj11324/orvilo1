import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://localhost:9222');
for (const c of browser.contexts()) {
  for (const p of c.pages()) console.log('TAB:', p.url().slice(0, 110));
}
process.exit(0);
