import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '../../core/getTestDB';
import { teams, users, workspaces } from '../../schemas';
import type { LobeChatDatabase } from '../../type';
import { RepositoryModel } from '../repository';
import { TeamModel } from '../team';

/**
 * Regression coverage for partial-unique-index upserts. The backing indexes
 * carry `WHERE <remote id> IS NOT NULL` predicates, so an `onConflict` target
 * without a matching `targetWhere` fails at runtime with
 * "no unique constraint matching the ON CONFLICT specification" (42P10).
 * Exercising the second write is what proves the upsert path works.
 */
const serverDB = await getTestDB();

const userId = 'user-upsert-test';
const workspaceId = 'ws-upsert-test';
const teamId = 'team-upsert-test';

const seedFixtures = async (db: LobeChatDatabase) => {
  await db.insert(users).values({ email: 'upsert@test.dev', id: userId });
  await db.insert(workspaces).values({
    id: workspaceId,
    name: 'Upsert WS',
    primaryOwnerId: userId,
    slug: 'upsert-ws',
  });
  await db.insert(teams).values({
    createdByUserId: userId,
    id: teamId,
    key: 'UPS',
    name: 'Upsert Team',
    workspaceId,
  });
};

beforeEach(async () => {
  await seedFixtures(serverDB);
});

afterEach(async () => {
  await serverDB.delete(workspaces).where(eq(workspaces.id, workspaceId));
  await serverDB.delete(users).where(eq(users.id, userId));
});

describe('remote-id upserts against partial unique indexes', () => {
  it('upsertWorkflowStateByRemoteId inserts then updates on conflict', async () => {
    const model = new TeamModel(serverDB, userId, workspaceId);

    const first = await model.upsertWorkflowStateByRemoteId({
      category: 'backlog',
      name: 'Backlog',
      position: 0,
      remoteStateId: 'st-remote-1',
      teamId,
    });
    const second = await model.upsertWorkflowStateByRemoteId({
      category: 'todo',
      name: 'Backlog Renamed',
      position: 0,
      remoteStateId: 'st-remote-1',
      teamId,
    });

    expect(second.id).toBe(first.id);
    expect(second.name).toBe('Backlog Renamed');
    expect(second.category).toBe('todo');
  });

  it('upsertCycleByRemoteId inserts then updates on conflict', async () => {
    const model = new TeamModel(serverDB, userId, workspaceId);

    const first = await model.upsertCycleByRemoteId({
      name: 'Cycle 1',
      number: 1,
      remoteCycleId: 'cyc-remote-1',
      teamId,
    });
    const second = await model.upsertCycleByRemoteId({
      name: 'Cycle 1 Renamed',
      number: 1,
      remoteCycleId: 'cyc-remote-1',
      teamId,
    });

    expect(second.id).toBe(first.id);
    expect(second.name).toBe('Cycle 1 Renamed');
  });

  it('upsertByRemoteIdentity inserts then updates on conflict', async () => {
    const model = new RepositoryModel(serverDB, userId, workspaceId);

    const coordinate = {
      defaultBranch: 'main',
      name: 'repo',
      owner: 'acme',
      url: 'https://github.com/acme/repo',
    };
    const first = await model.upsertByRemoteIdentity({
      coordinate,
      providerHost: 'github.com',
      remoteRepositoryId: 'remote-1',
    });
    const second = await model.upsertByRemoteIdentity({
      coordinate: { ...coordinate, defaultBranch: 'master' },
      providerHost: 'github.com',
      remoteRepositoryId: 'remote-1',
    });

    expect(second.id).toBe(first.id);
    expect(second.coordinate?.defaultBranch).toBe('master');
  });

  it('createLocalOnly inserts then updates on conflict', async () => {
    const model = new RepositoryModel(serverDB, userId, workspaceId);

    const first = await model.createLocalOnly({
      coordinate: { name: 'local-repo', owner: 'acme' },
      localOnlyKey: 'local-key-1',
    });
    const second = await model.createLocalOnly({
      coordinate: { name: 'local-repo-renamed', owner: 'acme' },
      localOnlyKey: 'local-key-1',
    });

    expect(second.id).toBe(first.id);
    expect(second.coordinate?.name).toBe('local-repo-renamed');
  });
});
