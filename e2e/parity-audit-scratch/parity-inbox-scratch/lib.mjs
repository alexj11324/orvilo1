import { chromium } from 'playwright';
export async function connect() {
  let lastErr;
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      const browser = await chromium.connectOverCDP('http://localhost:9222', { timeout: 60000 });
      const ctx = browser.contexts()[0];
      const page = await ctx.newPage();
      await page.setViewportSize({ width: 1440, height: 900 });
      return { browser, ctx, page };
    } catch (e) {
      lastErr = e;
      console.log(`connect attempt ${attempt + 1} failed: ${String(e.message || e).slice(0, 120)}`);
      await new Promise((r) => setTimeout(r, 8000 + attempt * 4000));
    }
  }
  throw lastErr;
}
