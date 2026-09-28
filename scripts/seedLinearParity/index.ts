/**
 * Seed the synthetic Linear parity fixture in an explicitly local environment.
 *
 * Prerequisite: run `.agents/acceptance/scripts/init-dev-env.sh seed-user`.
 * The command intentionally accepts no user or production target override.
 */
import * as dotenv from 'dotenv';
import dotenvExpand from 'dotenv-expand';

const env = process.env.NODE_ENV || 'development';
dotenvExpand.expand(dotenv.config());
dotenvExpand.expand(dotenv.config({ override: true, path: `.env.${env}` }));
dotenvExpand.expand(dotenv.config({ override: true, path: `.env.${env}.local` }));

type ClosableDatabase = {
  $client?: {
    end?: () => Promise<void>;
  };
};

const closeDatabase = async (database: ClosableDatabase | undefined) => {
  const client = database?.$client;
  if (client?.end) await client.end();
};

const main = async () => {
  if (process.env.ORVILO_PARITY_SEED_TARGET !== 'local') {
    throw new Error(
      'Refusing to seed: set ORVILO_PARITY_SEED_TARGET=local for the explicit local test target',
    );
  }
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set. Run the local dev environment bootstrap first.');
  }

  const [
    { serverDB },
    { LINEAR_PARITY_USER, seedLinearParity },
    { assertLocalParityDatabase, seedLinearParityVolume },
  ] = await Promise.all([
    import('../../packages/database/src/server'),
    import('../../packages/database/src/fixtures/linearParitySeed'),
    import('./seedParityVolume'),
  ]);
  assertLocalParityDatabase(process.env.DATABASE_URL);

  try {
    const result = await seedLinearParity(serverDB, {
      target: 'local',
      userId: LINEAR_PARITY_USER.id,
      workspaceId: process.env.ORVILO_PARITY_WORKSPACE_ID,
    });
    const volume = await seedLinearParityVolume(serverDB, {
      base: result,
      userId: LINEAR_PARITY_USER.id,
      workspaceId: result.workspaceId,
    });

    console.log(
      `Linear parity fixture ready: workspace=${result.workspaceId} team=${result.teamId} project=${result.projectId} tasks=${result.taskIds.length} myIssues=${result.myIssuesTaskIds.length} milestones=${result.milestoneIds.length}`,
    );
    console.log(
      `Linear parity volume ready: teams=${volume.teamIds.length} projects=${volume.projectIds.length} tasks=${volume.taskIds.length} milestones=${volume.milestoneIds.length} approvals=${volume.approvalIds.length} notifications=${volume.notificationIds.length} views=${volume.savedViewIds.length} favorites=${volume.favoriteIds.length}`,
    );
  } finally {
    await closeDatabase(serverDB);
  }
};

main().catch((error) => {
  console.error(
    'Linear parity seed failed:',
    error instanceof Error ? error.message : 'unknown error',
  );
  process.exitCode = 1;
});
