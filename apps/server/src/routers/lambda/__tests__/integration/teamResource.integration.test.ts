// @vitest-environment node
import type { OrviloDatabase } from '@orvilo/database';
import {
  documents,
  teamMembers,
  teams,
  users,
  workspaceMembers,
  workspaces,
} from '@orvilo/database/schemas';
import { getTestDB } from '@orvilo/database/test-utils';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { notebookRouter } from '../../notebook';
import { teamResourceRouter } from '../../teamResource';

let testDB: OrviloDatabase;
vi.mock('@/database/core/db-adaptor', () => ({
  getServerDB: vi.fn(function () {
    return testDB;
  }),
}));

const ownerId = 'team-resource-router-owner';
const memberId = 'team-resource-router-member';
const outsiderId = 'team-resource-router-outsider';
const workspaceId = 'team-resource-router-workspace';
const otherWorkspaceId = 'team-resource-router-other-workspace';
const teamId = 'team-resource-router-team';
const otherTeamId = 'team-resource-router-other-team';

const context = (userId: string, selectedWorkspaceId = workspaceId) => ({
  jwtPayload: { userId },
  userId,
  workspaceId: selectedWorkspaceId,
});

const createDocument = (params: {
  id: string;
  teamId?: string;
  userId?: string;
  visibility?: 'private' | 'public' | 'team';
  workspaceId?: string;
}) =>
  testDB.insert(documents).values({
    fileType: 'custom/document',
    id: params.id,
    source: 'document',
    sourceType: 'api',
    teamId: params.teamId,
    title: params.id,
    totalCharCount: 0,
    totalLineCount: 0,
    userId: params.userId ?? ownerId,
    visibility: params.visibility ?? 'public',
    workspaceId: params.workspaceId ?? workspaceId,
  });

beforeEach(async () => {
  testDB = await getTestDB();
  await testDB.delete(users);
  await testDB.insert(users).values([{ id: ownerId }, { id: memberId }, { id: outsiderId }]);
  await testDB.insert(workspaces).values([
    { id: workspaceId, name: 'Team resources', primaryOwnerId: ownerId, slug: workspaceId },
    {
      id: otherWorkspaceId,
      name: 'Other team resources',
      primaryOwnerId: outsiderId,
      slug: otherWorkspaceId,
    },
  ]);
  await testDB.insert(workspaceMembers).values([
    { role: 'owner', userId: ownerId, workspaceId },
    { role: 'member', userId: memberId, workspaceId },
    { role: 'owner', userId: outsiderId, workspaceId: otherWorkspaceId },
  ]);
  await testDB.insert(teams).values([
    {
      createdByUserId: ownerId,
      id: teamId,
      key: 'RES',
      name: 'Resources',
      visibility: 'public',
      workspaceId,
    },
    {
      createdByUserId: outsiderId,
      id: otherTeamId,
      key: 'OTH',
      name: 'Other',
      workspaceId: otherWorkspaceId,
    },
  ]);
  await testDB.insert(teamMembers).values([
    { role: 'lead', teamId, userId: ownerId, workspaceId },
    {
      role: 'lead',
      teamId: otherTeamId,
      userId: outsiderId,
      workspaceId: otherWorkspaceId,
    },
  ]);
});

afterEach(async () => {
  await testDB.delete(users);
  vi.restoreAllMocks();
});

describe('teamResourceRouter', () => {
  it('lets a non-creator team lead delete a team Page through the notebook route', async () => {
    const id = 'team-resource-router-notebook-page';
    await createDocument({ id, teamId, userId: memberId, visibility: 'team' });
    const page = await notebookRouter.createCaller(context(ownerId)).deleteDocument({ id });

    expect(page).toEqual({ success: true });
    expect(await testDB.query.documents.findFirst({ where: eq(documents.id, id) })).toBeUndefined();
  });

  it('serves persistent section, link, document attachment, move, and removal operations', async () => {
    const caller = teamResourceRouter.createCaller(context(ownerId));
    const { data: section } = await caller.createSection({ name: 'References', teamId });
    const { data: link } = await caller.createLink({
      sectionId: section.id,
      teamId,
      title: 'Brief',
      url: 'https://example.com/brief',
    });
    await caller.updateLink({
      resourceId: link.id,
      teamId,
      title: 'Updated brief',
      url: 'https://example.com/revised',
    });
    await caller.moveResource({ position: 7, resourceId: link.id, sectionId: null, teamId });

    await createDocument({ id: 'team-resource-router-public-doc' });
    const { data: attached } = await caller.attachDocument({
      documentId: 'team-resource-router-public-doc',
      sectionId: section.id,
      teamId,
    });
    await expect(
      caller.attachDocument({ documentId: 'team-resource-router-public-doc', teamId }),
    ).rejects.toThrow('already attached');

    const { data: created } = await caller.createDocument({
      sectionId: section.id,
      teamId,
      title: 'Team plan',
    });
    const listed = (await caller.list({ teamId })).data;
    expect(listed.sections).toHaveLength(1);
    expect(listed).toMatchObject({ canCreateDocument: true, canWrite: true });
    expect(listed.resources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: link.id, kind: 'link', title: 'Updated brief' }),
        expect.objectContaining({ id: attached.id, kind: 'document' }),
        expect.objectContaining({
          id: created.resource.id,
          kind: 'document',
          ownedByTeam: true,
          document: expect.objectContaining({ teamId, visibility: 'team' }),
        }),
      ]),
    );
    await expect(
      caller.detachDocument({ resourceId: created.resource.id, teamId }),
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });

    await caller.detachDocument({ resourceId: attached.id, teamId });
    const [stillExists] = await testDB
      .select({ id: documents.id })
      .from(documents)
      .where(eq(documents.id, 'team-resource-router-public-doc'));
    expect(stillExists).toEqual({ id: 'team-resource-router-public-doc' });

    await caller.deleteSection({ sectionId: section.id, teamId });
    expect((await caller.list({ teamId })).data.resources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: link.id, sectionId: null }),
        expect.objectContaining({ id: created.resource.id, sectionId: null }),
      ]),
    );
    await caller.removeLink({ resourceId: link.id, teamId });
  });

  it('rejects unsafe links and documents that are private or in another workspace', async () => {
    const caller = teamResourceRouter.createCaller(context(ownerId));
    await createDocument({ id: 'team-resource-router-private-doc', visibility: 'private' });
    await createDocument({
      id: 'team-resource-router-foreign-doc',
      userId: outsiderId,
      workspaceId: otherWorkspaceId,
    });

    await expect(
      caller.createLink({ teamId, url: 'https://user:secret@example.com' }),
    ).rejects.toThrow('without credentials');
    await expect(caller.createLink({ teamId, url: 'javascript:alert(1)' })).rejects.toThrow(
      'HTTP(S)',
    );
    await expect(
      caller.attachDocument({ documentId: 'team-resource-router-private-doc', teamId }),
    ).rejects.toThrow('Document not found');
    await expect(
      caller.attachDocument({ documentId: 'team-resource-router-foreign-doc', teamId }),
    ).rejects.toThrow('Document not found');
  });

  it('lets workspace members read public-team resources but requires current team write access', async () => {
    const owner = teamResourceRouter.createCaller(context(ownerId));
    const member = teamResourceRouter.createCaller(context(memberId));
    await owner.createLink({ teamId, title: 'Visible', url: 'https://example.com' });

    const memberView = (await member.list({ teamId })).data;
    expect(memberView).toMatchObject({ canCreateDocument: false, canWrite: false });
    expect(memberView.resources).toEqual([
      expect.objectContaining({ kind: 'link', title: 'Visible' }),
    ]);
    await expect(member.createSection({ name: 'Denied', teamId })).rejects.toThrow(
      'Team write access required',
    );
  });

  it('does not leak or mutate a team selected through the wrong workspace', async () => {
    const caller = teamResourceRouter.createCaller(context(ownerId));
    await expect(caller.list({ teamId: otherTeamId })).rejects.toThrow('Team not found');
    await expect(
      caller.createSection({ name: 'Cross workspace', teamId: otherTeamId }),
    ).rejects.toThrow('Team not found');
  });
});
