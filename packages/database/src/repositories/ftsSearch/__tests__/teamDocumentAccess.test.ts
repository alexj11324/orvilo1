// @vitest-environment node
import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '../../../core/getTestDB';
import {
  documents,
  teamMembers,
  teams,
  users,
  workspaceMembers,
  workspaces,
} from '../../../schemas';
import type { OrviloDatabase } from '../../../type';
import { hydratePages } from '../elasticsearch/hydration';
import { searchPages } from '../pgSearch/documents';
import { createPgSearchFtsSearchContext } from '../pgSearch/scope';

const db: OrviloDatabase = await getTestDB();
const author = 'team-fts-author';
const member = 'team-fts-member';
const outsider = 'team-fts-outsider';
const admin = 'team-fts-admin';
let workspaceId: string;
let teamId: string;
let documentId: string;

beforeEach(async () => {
  await db.insert(users).values([author, member, outsider, admin].map((id) => ({ id })));
  const [workspace] = await db
    .insert(workspaces)
    .values({ name: 'Team FTS workspace', primaryOwnerId: admin, slug: 'team-fts-workspace' })
    .returning();
  workspaceId = workspace.id;
  await db.insert(workspaceMembers).values(
    [author, member, outsider, admin].map((userId) => ({
      role: userId === admin ? ('owner' as const) : ('member' as const),
      userId,
      workspaceId,
    })),
  );
  const [team] = await db
    .insert(teams)
    .values({ key: 'TFS', name: 'Secret team', visibility: 'private', workspaceId })
    .returning();
  teamId = team.id;
  await db.insert(teamMembers).values([
    { teamId, userId: author, workspaceId },
    { teamId, userId: member, workspaceId },
  ]);
  const [document] = await db
    .insert(documents)
    .values({
      content: 'team access search phrase',
      fileType: 'custom/document',
      source: 'document',
      sourceType: 'api',
      teamId,
      title: 'Team search document',
      totalCharCount: 25,
      totalLineCount: 1,
      userId: author,
      visibility: 'team',
      workspaceId,
    })
    .returning();
  documentId = document.id;
});

afterEach(async () => {
  await db.delete(documents);
  await db.delete(workspaces);
  await db.delete(users);
});

const ids = (items: Array<{ id: string }>) => items.map((item) => item.id);

describe('team document search authorization', () => {
  it('filters Elasticsearch candidates at live document hydration after revocation', async () => {
    const hits = [{ id: documentId, rank: 1, score: 1 }];
    const scope = { userId: member, workspaceId };
    expect(ids(await hydratePages(db, hits, scope, 10))).toContain(documentId);
    expect(ids(await hydratePages(db, hits, { userId: outsider, workspaceId }, 10))).toEqual([]);
    expect(
      ids(await hydratePages(db, hits, { ...scope, callerAgentVisibility: 'public' }, 10)),
    ).toEqual([]);

    await db
      .delete(teamMembers)
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, member)));
    expect(ids(await hydratePages(db, hits, scope, 10))).toEqual([]);
  });

  it.skipIf(process.env.TEST_SERVER_DB !== '1')(
    'filters pg_search Page results after membership revocation',
    async () => {
      const scope = { userId: member, workspaceId };
      const search = () =>
        searchPages(createPgSearchFtsSearchContext(db, scope), 'team access search phrase', 10);
      expect(ids((await search()).items)).toContain(documentId);
      await db
        .delete(teamMembers)
        .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, member)));
      expect(ids((await search()).items)).not.toContain(documentId);
    },
  );
});
