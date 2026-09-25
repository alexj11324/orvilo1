// Shared robust login for Orvilo parity scripts (headless context).
export async function orviloLogin(page, base, log = () => {}) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await page.goto(`${base}/signin`, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await page.waitForTimeout(3000);
      // If already signed in, signin redirects away
      if (!page.url().includes('/signin')) {
        log('login: already in');
        return true;
      }
      // pre-consent button variant
      const pre = page.getByRole('button', { name: /agree and continue/i });
      if (
        (await pre.count()) &&
        (await pre
          .first()
          .isVisible()
          .catch(() => false))
      ) {
        await pre.first().click();
        await page.waitForTimeout(1200);
      }
      const email = page
        .locator('input[type="email"], input[name="email"], input[placeholder*="email" i]')
        .first();
      if (!(await email.count()) || !(await email.isVisible().catch(() => false))) {
        log('login: no email field, url=' + page.url());
        await page.waitForTimeout(2000);
        continue;
      }
      await email.click();
      await email.fill('agent-testing@orvilo.aspectlylabs.com');
      const cb = page.locator('text=/I have read and agree/i').first();
      if (await cb.count()) await cb.click().catch(() => {});
      await page.waitForTimeout(400);
      await page
        .getByRole('button', { name: /^next$/i })
        .first()
        .click();
      // wait for either agree screen or password
      for (let i = 0; i < 30; i++) {
        await page.waitForTimeout(1000);
        if (
          await page
            .locator('input[type="password"]')
            .first()
            .isVisible()
            .catch(() => false)
        )
          break;
        const agree = page.getByRole('button', { name: /agree and continue/i });
        if (
          (await agree.count()) &&
          (await agree
            .first()
            .isVisible()
            .catch(() => false))
        ) {
          await agree.first().click();
          continue;
        }
      }
      const pwd = page.locator('input[type="password"]').first();
      if (!(await pwd.isVisible().catch(() => false))) {
        log('login: no password field attempt ' + attempt);
        continue;
      }
      await pwd.click();
      await pwd.fill('TestPassword123!');
      await page
        .getByRole('button', { name: /sign in|log in|登录|^next$/i })
        .first()
        .click();
      for (let i = 0; i < 25; i++) {
        await page.waitForTimeout(1000);
        if (!page.url().includes('/signin')) {
          log('login: ok -> ' + page.url());
          return true;
        }
      }
      log('login: still on signin attempt ' + attempt);
    } catch (e) {
      log('login attempt ' + attempt + ' err ' + e.message.split('\n')[0]);
    }
  }
  return false;
}
