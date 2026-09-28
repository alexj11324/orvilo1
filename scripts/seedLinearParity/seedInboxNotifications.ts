/**
 * Seed the synthetic Inbox rows used by the Linear parity visual replay.
 *
 * This is intentionally separate from the shared project/task parity seed so
 * Inbox verification can reset only its own notifications. It accepts only the
 * synthetic local user and deletes only rows carrying this fixture's dedupe
 * prefix.
 *
 * Run from the repository root:
 *   ORVILO_PARITY_SEED_TARGET=local bun scripts/seedLinearParity/seedInboxNotifications.ts
 */
import * as dotenv from 'dotenv';
import dotenvExpand from 'dotenv-expand';
import { and, eq, like } from 'drizzle-orm';

const env = process.env.NODE_ENV || 'development';
dotenvExpand.expand(dotenv.config());
dotenvExpand.expand(dotenv.config({ override: true, path: `.env.${env}` }));
dotenvExpand.expand(dotenv.config({ override: true, path: `.env.${env}.local` }));

const FIXTURE_DEDUPE_PREFIX = 'linear-parity-inbox:';
const LOCAL_PARITY_DATABASE = {
  database: 'orvilo_linear_parity_20260922',
  hostname: 'localhost',
  port: '5432',
} as const;

const assertLocalParityDatabase = (value: string) => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('DATABASE_URL is not a valid URL');
  }

  const database = url.pathname.replace(/^\//, '');
  if (
    (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') ||
    url.hostname !== LOCAL_PARITY_DATABASE.hostname ||
    url.port !== LOCAL_PARITY_DATABASE.port ||
    database !== LOCAL_PARITY_DATABASE.database
  ) {
    throw new Error(
      `Refusing to seed Inbox notifications outside ${LOCAL_PARITY_DATABASE.hostname}:${LOCAL_PARITY_DATABASE.port}/${LOCAL_PARITY_DATABASE.database}`,
    );
  }
};

const closeDatabase = async (database: { $client?: { end?: () => Promise<void> } }) => {
  if (database.$client?.end) await database.$client.end();
};

const main = async () => {
  if (process.env.ORVILO_PARITY_SEED_TARGET !== 'local') {
    throw new Error('Refusing to seed Inbox notifications: set ORVILO_PARITY_SEED_TARGET=local');
  }
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set. Run the local dev environment bootstrap first.');
  }
  assertLocalParityDatabase(process.env.DATABASE_URL);

  const [
    { LINEAR_PARITY_USER, seedLinearParity },
    { NotificationModel },
    { notifications },
    { serverDB },
  ] = await Promise.all([
    import('../../packages/database/src/fixtures/linearParitySeed'),
    import('../../packages/database/src/models/notification'),
    import('../../packages/database/src/schemas/notification'),
    import('../../packages/database/src/server'),
  ]);

  try {
    const seeded = await seedLinearParity(serverDB, {
      target: 'local',
      userId: LINEAR_PARITY_USER.id,
    });
    const model = new NotificationModel(serverDB, LINEAR_PARITY_USER.id, {
      workspaceId: seeded.workspaceId,
    });

    await serverDB
      .delete(notifications)
      .where(
        and(
          eq(notifications.userId, LINEAR_PARITY_USER.id),
          eq(notifications.workspaceId, seeded.workspaceId),
          like(notifications.dedupeKey, `${FIXTURE_DEDUPE_PREFIX}%`),
        ),
      );

    const now = Date.now();
    const rows = [
      {
        actionKind: 'task_review',
        actionRequestId: 'linear-parity-review-1',
        category: 'pending',
        content: 'Review the synthetic acceptance evidence before the local release can continue.',
        dedupeKey: `${FIXTURE_DEDUPE_PREFIX}review`,
        id: '10000000-0000-4000-8000-000000000001',
        isRead: true,
        kind: 'action' as const,
        metadata: {
          agent: {
            backgroundColor: '#6d79d4',
            id: 'fixture-agent',
            name: 'Parity Agent',
          },
        },
        title: 'Synthetic release gate needs review',
        type: 'task_review',
      },
      {
        category: 'mention',
        content: 'A teammate mentioned you in the synthetic project planning thread.',
        dedupeKey: `${FIXTURE_DEDUPE_PREFIX}mention-1`,
        id: '10000000-0000-4000-8000-000000000002',
        isRead: false,
        kind: 'update' as const,
        metadata: { actor: { name: 'Fixture Teammate', userId: 'fixture-teammate' } },
        title: 'Confirm the milestone owner',
        type: 'mention',
      },
      {
        category: 'mention',
        content: 'The synthetic dependency changed and may affect the next local task.',
        dedupeKey: `${FIXTURE_DEDUPE_PREFIX}mention-2`,
        id: '10000000-0000-4000-8000-000000000003',
        isRead: false,
        kind: 'update' as const,
        metadata: {
          agent: {
            backgroundColor: '#3aa675',
            id: 'fixture-agent-2',
            name: 'Build Agent',
          },
        },
        title: 'Dependency update needs attention',
        type: 'mention',
      },
      {
        category: 'mention',
        content: 'A focused parity check completed with one item ready for inspection.',
        dedupeKey: `${FIXTURE_DEDUPE_PREFIX}mention-3`,
        id: '10000000-0000-4000-8000-000000000004',
        isRead: false,
        kind: 'update' as const,
        title: 'Inbox interaction evidence is ready',
        type: 'mention',
      },
      {
        category: 'activity',
        content: 'The local fixture refresh finished without changing production data.',
        dedupeKey: `${FIXTURE_DEDUPE_PREFIX}update`,
        id: '10000000-0000-4000-8000-000000000005',
        isRead: false,
        kind: 'update' as const,
        title: 'Synthetic fixture refreshed',
        type: 'task_assigned',
      },
    ];

    for (const [index, row] of rows.entries()) {
      await model.create({
        ...row,
        lastActivityAt: new Date(now - index * 60 * 60 * 1000),
        workspaceId: seeded.workspaceId,
      });
    }

    const fixtureRows = await serverDB
      .select({ id: notifications.id })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, LINEAR_PARITY_USER.id),
          eq(notifications.workspaceId, seeded.workspaceId),
          like(notifications.dedupeKey, `${FIXTURE_DEDUPE_PREFIX}%`),
        ),
      );
    if (fixtureRows.length !== rows.length) {
      throw new Error(
        `Inbox parity fixture expected ${rows.length} rows, found ${fixtureRows.length}`,
      );
    }

    console.log(
      `Inbox parity fixture ready: workspace=${seeded.workspaceId} notifications=${fixtureRows.length}`,
    );
  } finally {
    await closeDatabase(serverDB);
  }
};

main().catch((error) => {
  console.error(
    'Inbox parity seed failed:',
    error instanceof Error ? error.message : 'unknown error',
  );
  process.exitCode = 1;
});
