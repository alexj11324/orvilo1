import { Given, When } from '@cucumber/cucumber';
import { expect } from '@playwright/test';

import { createTestSession } from '../../support/seedTestUser';
import type { CustomWorld } from '../../support/world';

/** Mirrors AUTH_SESSION_COOKIE in packages/database/src/models/authSession.ts. */
const AUTH_SESSION_COOKIE = 'orvilo_auth';

/**
 * Install an `orvilo_auth` session cookie for the seeded test user.
 * Web sign-in lives on the accounts portal (Clerk); e2e seeds the app-issued
 * session row directly instead of driving the portal UI.
 */

const loginWithSession = async (world: CustomWorld) => {
  const PORT = process.env.PORT ? Number(process.env.PORT) : 3006;
  const baseURL = process.env.BASE_URL || `http://localhost:${PORT}`;

  const sessionToken = await createTestSession();
  if (!sessionToken) throw new Error('Failed to create a test session (is DATABASE_URL set?)');

  await world.browserContext.addCookies([
    {
      name: AUTH_SESSION_COOKIE,
      url: baseURL,
      value: sessionToken,
    },
  ]);

  console.log('✅ Session cookies set for test user');
};

Given('I am logged in as the test user', async function (this: CustomWorld) {
  await loginWithSession(this);
});

Given('I am logged in with a session', async function (this: CustomWorld) {
  await loginWithSession(this);
});

/**
 * Navigate to signin page
 */
When('I navigate to the signin page', async function (this: CustomWorld) {
  await this.page.goto('/signin');
  await this.page.waitForLoadState('domcontentloaded');
});

/**
 * Verify login was successful
 */
Given('I should be logged in', async function (this: CustomWorld) {
  // Check we're not on signin page anymore
  await expect(this.page).not.toHaveURL(/\/signin/);

  console.log('✅ User is logged in');
});

/**
 * Logout the current user
 */
When('I logout', async function (this: CustomWorld) {
  // Clear cookies to logout
  await this.browserContext.clearCookies();
  console.log('✅ User logged out (cookies cleared)');
});
