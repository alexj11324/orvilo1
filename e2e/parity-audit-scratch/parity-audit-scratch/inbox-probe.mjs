import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://localhost:9222', { timeout: 120000 });
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => p.url().includes('localhost:9814'));
if (!page) {
  console.log('NO 9814 TAB');
  process.exit(1);
}
const info = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('[data-inbox-id]')];
  const r0 = rows[0];
  const timeEl = r0?.querySelector('.work-inbox-row-time, [title]');
  const strip = document.querySelector('.work-inbox-row-actions');
  const glyphRows = rows.slice(0, 15).map((r) => {
    const hasAvatar = !!r.querySelector('img, [class*="avatar" i], [class*="Avatar"]');
    return { hasAvatar, svgs: r.querySelectorAll('svg').length };
  });
  const actorWithTail = glyphRows.filter((g) => g.hasAvatar && g.svgs >= 1).length;
  return {
    url: location.href,
    rowCount: rows.length,
    actorWithTail,
    actorTotal: glyphRows.filter((g) => g.hasAvatar).length,
    timeTitle: timeEl?.getAttribute('title') || null,
    stripExists: !!strip,
    stripBtns: strip ? strip.querySelectorAll('button,[role="button"]').length : 0,
    paneSnooze: !!document.querySelector(
      '[class*="paneHeader"] [title*="Snooze" i], [class*="paneHeader"] [aria-label*="Snooze" i]',
    ),
    paneArchive: !!document.querySelector(
      '[class*="paneHeader"] [title*="Archive" i], [class*="paneHeader"] [aria-label*="Archive" i]',
    ),
  };
});
console.log(JSON.stringify(info, null, 2));
browser.close();
