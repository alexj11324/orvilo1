import { chromium } from 'playwright';
export async function connectPatient(maxMinutes = 25) {
  const deadline = Date.now() + maxMinutes * 60000;
  let n = 0;
  while (Date.now() < deadline) {
    n++;
    try {
      return await chromium.connectOverCDP('http://127.0.0.1:9222', { timeout: 20000 });
    } catch (e) {
      console.log(
        `[${new Date().toISOString().slice(11, 19)}] connect attempt ${n} failed: ${e.message.split('\n')[0].slice(0, 80)}`,
      );
      await new Promise((r) => setTimeout(r, 20000));
    }
  }
  throw new Error('CDP never came back');
}
