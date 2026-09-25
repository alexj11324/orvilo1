import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages()[0] ?? (await ctx.newPage());
const url =
  'https://app.devin.ai/auth/login?redirect=%2Fauth%2Fcli%2Fcontinue%3Fredirect_uri%3Dhttp%253A%252F%252F127.0.0.1%253A59553%252Fcallback%26state%3D4a9fb786-b6f9-4d23-b6ce-ac5a6447b4a2%26prompt%3Dselect_account%26code_challenge%3DyPhX0NpQaiKg7qdsbi_Cjo-zMaQwcuPgN8C3owXC028%26code_challenge_method%3DS256%26cli_pkce_marker%3D1&reauth=true';
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(4000);
await page.screenshot({ path: '/tmp/devin-auth-1.png' });
console.log('URL:', page.url());
process.exit(0);
