import { chromium } from 'playwright';

export async function connect(attempts = 8) {
  for (let i = 0; i < attempts; i++) {
    try {
      const browser = await chromium.connectOverCDP('http://localhost:9222', { timeout: 30000 });
      return browser;
    } catch (e) {
      console.log(`connect attempt ${i + 1} failed: ${e.message.slice(0, 80)}`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  throw new Error('CDP unreachable');
}

export const shot = (page, p, clip) =>
  page.screenshot({ path: p, timeout: 6000, clip }).catch(() => console.log('shot skip', p));
