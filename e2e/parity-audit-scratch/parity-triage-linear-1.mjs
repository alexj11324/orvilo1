import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto('https://linear.app/bdiverifier/team/ORV/triage', {
  waitUntil: 'domcontentloaded',
});
await page.waitForTimeout(6000);
await page.screenshot({ path: '/tmp/parity-audit-2026-09-23/triage/linear-triage-initial.png' });
console.log('URL:', page.url());
console.log('TITLE:', await page.title());

// Dump main content structure
const info = await page.evaluate(() => {
  const main = document.querySelector('main') || document.body;
  const out = [];
  // header-ish region
  const walk = (el, depth, maxDepth) => {
    if (depth > maxDepth) return;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return;
    const tag = el.tagName.toLowerCase();
    const role = el.getAttribute('role');
    const ariaLabel = el.getAttribute('aria-label');
    const cls = typeof el.className === 'string' ? el.className.slice(0, 80) : '';
    const text =
      el.childNodes.length === 1 && el.childNodes[0].nodeType === 3
        ? el.textContent.trim().slice(0, 60)
        : '';
    if (
      ['button', 'a', 'input', 'select'].includes(tag) ||
      role === 'button' ||
      role === 'tab' ||
      role === 'columnheader' ||
      role === 'row' ||
      text
    ) {
      out.push(
        `${'  '.repeat(depth)}<${tag}${role ? ` role=${role}` : ''}${ariaLabel ? ` aria="${ariaLabel}"` : ''}> "${text}" [${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}] ${cls}`,
      );
    } else {
      out.push(
        `${'  '.repeat(depth)}<${tag}> [${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}] ${cls}`,
      );
    }
    for (const c of el.children) walk(c, depth + 1, maxDepth);
  };
  walk(main, 0, 7);
  return out.join('\n');
});
console.log(info);
await page.close();
process.exit(0);
