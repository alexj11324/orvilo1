import { createHash, randomBytes } from 'node:crypto';

import { clerkFixtureForUser } from './clerkFixture';

const runId = process.env.E2E_RUN_ID || process.env.GITHUB_RUN_ID || 'local';
const workerId = process.env.CUCUMBER_WORKER_ID || process.env.E2E_WORKER_ID || 'local';
const testScope = runId === 'local' ? workerId : `${runId}_${workerId}`;
const workerSuffix = testScope.replaceAll(/[^\w-]/g, '_');
const isParallelWorker = workerSuffix !== 'local';

// Test user credentials - these are used for e2e testing only
export const TEST_USER = {
  email: isParallelWorker
    ? `e2e-test+${workerSuffix}@orvilo.aspectlylabs.com`
    : 'e2e-test@orvilo.aspectlylabs.com',
  fullName: isParallelWorker ? `E2E Test User ${workerSuffix}` : 'E2E Test User',
  id: isParallelWorker ? `user_e2e_test_user_${workerSuffix}` : 'user_e2e_test_user_001',
  password: 'TestPassword123!',
  username: isParallelWorker ? `e2e_test_user_${workerSuffix}` : 'e2e_test_user',
};

/**
 * Seed test user into the database for e2e testing
 * This function connects directly to PostgreSQL and creates the necessary records
 */
export async function seedTestUser(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.log('⚠️ DATABASE_URL not set, skipping test user seeding');
    return;
  }

  // Dynamic import pg to avoid bundling issues
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: databaseUrl });

  try {
    await client.connect();
    console.log('🔌 Connected to database for test user seeding');

    const now = new Date().toISOString();

    // Use ON CONFLICT DO NOTHING to handle all unique constraint conflicts
    // This is safe because we're using fixed test user credentials
    // Set onboarding as completed to skip onboarding flow in tests
    const onboarding = JSON.stringify({ finishedAt: now, version: 1 });

    await client.query(
      `INSERT INTO users (id, email, normalized_email, username, full_name, email_verified, onboarding, created_at, updated_at, last_active_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8, $8)
       ON CONFLICT (id) DO UPDATE SET onboarding = $7, updated_at = $8`,
      [
        TEST_USER.id,
        TEST_USER.email,
        TEST_USER.email.toLowerCase(),
        TEST_USER.username,
        TEST_USER.fullName,
        true, // email_verified
        onboarding,
        now,
      ],
    );

    console.log('✅ Test user seeded successfully');
    console.log(`   Email: ${TEST_USER.email}`);
  } catch (error) {
    console.error('❌ Failed to seed test user:', error);
    throw error;
  } finally {
    await client.end();
  }
}

export async function createTestSession(): Promise<string | null> {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.log('⚠️ DATABASE_URL not set, cannot create test session');
    return null;
  }

  await seedTestUser();

  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: databaseUrl });

  try {
    await client.connect();

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const sessionId = randomBytes(9).toString('base64url');
    const bearerToken = randomBytes(48).toString('base64url');
    const digest = `sha256:${createHash('sha256').update(bearerToken).digest('hex')}`;
    const clerk = clerkFixtureForUser(TEST_USER.id);

    await client.query('BEGIN');
    await client.query(
      `INSERT INTO accounts (id, account_id, provider_id, user_id, created_at, updated_at)
       VALUES ($1, $2, 'clerk', $3, $4, $4) ON CONFLICT (id) DO NOTHING`,
      [`clerk:${clerk.upstreamUserId}`, clerk.upstreamUserId, TEST_USER.id, now.toISOString()],
    );
    await client.query(
      `INSERT INTO auth_sessions (id, token, user_id, expires_at, created_at, updated_at, clerk_session_id, clerk_user_id)
       VALUES ($1, $2, $3, $4, $5, $5, $6, $7)`,
      [
        sessionId,
        digest,
        TEST_USER.id,
        expiresAt.toISOString(),
        now.toISOString(),
        clerk.sessionId,
        clerk.upstreamUserId,
      ],
    );
    await client.query('COMMIT');

    return bearerToken;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

/**
 * Clean up test user data after tests
 */
export async function cleanupTestUser(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    return;
  }

  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: databaseUrl });

  try {
    await client.connect();

    // Delete sessions first (foreign key)
    await client.query('DELETE FROM auth_sessions WHERE user_id = $1', [TEST_USER.id]);

    // Delete user
    await client.query('DELETE FROM users WHERE id = $1', [TEST_USER.id]);

    console.log('🧹 Test user cleaned up');
  } catch (error) {
    console.error('❌ Failed to cleanup test user:', error);
  } finally {
    await client.end();
  }
}
