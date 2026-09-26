// @vitest-environment node
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getTestDB } from '@/database/core/getTestDB';
import { projects, users, workspaces } from '@/database/schemas';

import { LinearImportService } from './index';

const db = await getTestDB();
const workspaceId = 'linear-import-destinations-workspace';
const otherWorkspaceId = 'linear-import-destinations-other';
const userId = 'linear-import-destinations-user';

beforeAll(async () => {
  await db.insert(users).values({ id: userId });
  await db.insert(workspaces).values([
    { id: workspaceId, name: 'Import', slug: workspaceId, primaryOwnerId: userId },
    { id: otherWorkspaceId, name: 'Other', slug: otherWorkspaceId, primaryOwnerId: userId },
  ]);
  await db.insert(projects).values([
    ...Array.from({ length: 51 }, (_, n) => ({
      name: `Project ${String(n).padStart(2, '0')}`,
      identifier: `P${String(n).padStart(2, '0')}`,
      workspaceId,
      userId,
      visibility: 'public' as const,
    })),
    {
      name: 'Private project',
      identifier: 'PRIV',
      workspaceId,
      userId,
      visibility: 'private' as const,
    },
    {
      name: 'Other workspace',
      identifier: 'OTHR',
      workspaceId: otherWorkspaceId,
      userId,
      visibility: 'public' as const,
    },
  ]);
});
afterAll(async () => {
  await db.delete(projects).where(eq(projects.workspaceId, workspaceId));
  await db.delete(projects).where(eq(projects.workspaceId, otherWorkspaceId));
  await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
  await db.delete(workspaces).where(eq(workspaces.id, otherWorkspaceId));
  await db.delete(users).where(eq(users.id, userId));
});

describe('Linear import destinations', () => {
  it('paginates every public workspace project without exposing private or other-workspace rows', async () => {
    const service = new LinearImportService(db, workspaceId);
    const first = await service.destinations({ offset: 0, limit: 30 });
    const second = await service.destinations({ offset: first.nextOffset!, limit: 30 });
    expect(first.items).toHaveLength(30);
    expect(first.nextOffset).toBe(30);
    expect(second.items).toHaveLength(21);
    expect(second.nextOffset).toBeNull();
    expect([...first.items, ...second.items].map((item) => item.name)).not.toContain(
      'Private project',
    );
    expect([...first.items, ...second.items].map((item) => item.name)).not.toContain(
      'Other workspace',
    );
  });

  it('searches by name or identifier within the public destination scope', async () => {
    const service = new LinearImportService(db, workspaceId);
    expect(
      (await service.destinations({ search: 'p50', offset: 0, limit: 30 })).items.map(
        (item) => item.name,
      ),
    ).toEqual(['Project 50']);
    expect((await service.destinations({ search: 'private', offset: 0, limit: 30 })).items).toEqual(
      [],
    );
  });
});
