import { chromium } from 'playwright';
export async function connect(tries = 8) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      return await chromium.connectOverCDP('http://localhost:9222', { timeout: 45000 });
    } catch (e) {
      lastErr = e;
      console.log(`connect retry ${i + 1}: ${e.message.slice(0, 80)}`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  throw lastErr;
}
