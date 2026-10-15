import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { assertTestDatabaseUrl } from '../src/core/getTestDB';
import { initializeFreshTaskReviewerSchema } from '../src/core/initializeFreshTaskReviewerSchema';
import type { OrviloDatabase } from '../src/type';

const initialize = async () => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString)
    throw new Error('DATABASE_URL is required for fresh E2E schema initialization');
  assertTestDatabaseUrl(connectionString);

  const pool = new Pool({ connectionString });
  try {
    await initializeFreshTaskReviewerSchema(drizzle(pool) as unknown as OrviloDatabase);
    console.info('[E2E] Fresh Issue reviewer schema initialized');
  } finally {
    await pool.end();
  }
};

initialize().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
