const assert = require('node:assert/strict');
const { chromium } = require('playwright');

// Open a populated acceptance in the actual desktop app before running this.
// Usage: node e2e/scripts/assertAcceptanceChipKeyboard.cjs <CDP URL> <check id>
(async () => {
  const endpoint = process.argv[2];
  const checkId = process.argv[3];
  assert(endpoint && checkId, 'Provide the actual Electron CDP URL and check id');
  const browser = await chromium.connectOverCDP(endpoint);
  try {
    const page = browser
      .contexts()[0]
      .pages()
      .find((entry) => entry.url().startsWith('app://'));
    assert(page, 'An actual Electron app page is required');
    // The selector is an application check identifier, not user-authored text.
    const check = page.locator(`[data-check-row="${checkId}"]:visible`).first();
    await check.waitFor();
    const header = check.locator('[aria-expanded]').first();
    const chip = check.locator('span[role="button"]').filter({ hasText: /^C\d+$/ });
    const expected = (await chip.innerText()).trim();
    for (const key of ['Enter', 'Space']) {
      await page.evaluate(() => navigator.clipboard.writeText('native-keyboard-sentinel'));
      const expanded = await header.getAttribute('aria-expanded');
      await chip.focus();
      await chip.press(key);
      assert.equal(
        await header.getAttribute('aria-expanded'),
        expanded,
        `${key} changed disclosure`,
      );
      assert.equal(
        await page.evaluate(() => navigator.clipboard.readText()),
        expected,
        `${key} did not copy the sequence`,
      );
    }
    console.log('PASS: Enter and Space copy the check sequence without toggling its row');
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
