import { chromium } from 'playwright';
export async function connect(retries = 6) {
  let lastErr;
  for (let i = 0; i < retries; i++) {
    try {
      return await chromium.connectOverCDP('http://127.0.0.1:9817', { timeout: 60000 });
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 4000));
    }
  }
  throw lastErr;
}
