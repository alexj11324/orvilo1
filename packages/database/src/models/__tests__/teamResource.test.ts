// @vitest-environment node
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '../../core/getTestDB';
import {
  documents,
  teamMembers,
  teamResourcePlacements,
  teams,
  users,
  workspaceMembers,
  workspaces,
} from '../../schemas';
import type { OrviloDatabase } from '../../type';
import {
  TEAM_RESOURCE_DOCUMENT_ALREADY_ATTACHED,
  TEAM_RESOURCE_DOCUMENT_NOT_ATTACHABLE,
  TEAM_RESOURCE_OWNED_DOCUMENT,
  TeamResourceModel,
} from '../teamResource';

const db: OrviloDatabase = await getTestDB();
const ownerId = 'team-resource-owner';
const otherId = 'team-resource-other';
const workspaceId = 'team-resource-workspace';
const otherWorkspaceId = 'team-resource-other-workspace';
const teamId = 'team-resource-team';
const otherTeamId = 'team-resource-other-team';

const model = new TeamResourceModel(db, ownerId, workspaceId);

const createDocument = (params: {
  id: string;
  teamId?: string;
  userId?: string;
  visibility?: 'private' | 'public' | 'team';
  workspaceId?: string;
}) =>
  db.insert(documents).values({
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
  await db.delete(users);
  await db.insert(users).values([{ id: ownerId }, { id: otherId }]);
  await db.insert(workspaces).values([
    { id: workspaceId, name: 'Resources', primaryOwnerId: ownerId, slug: workspaceId },
    {
      id: otherWorkspaceId,
      name: 'Other resources',
      primaryOwnerId: otherId,
      slug: otherWorkspaceId,
    },
  ]);
  await db.insert(workspaceMembers).values([
    { role: 'owner', userId: ownerId, workspaceId },
    { role: 'owner', userId: otherId, workspaceId: otherWorkspaceId },
  ]);
  await db.insert(teams).values([
    { createdByUserId: ownerId, id: teamId, key: 'RES', name: 'Resources', workspaceId },
    {
      createdByUserId: otherId,
      id: otherTeamId,
      key: 'OTH',
      name: 'Other',
      workspaceId: otherWorkspaceId,
    },
  ]);
  await db.insert(teamMembers).values([
    { role: 'lead', teamId, userId: ownerId, workspaceId },
    { role: 'lead', teamId: otherTeamId, userId: otherId, workspaceId: otherWorkspaceId },
  ]);
});

afterEach(async () => {
  await db.delete(users);
});

describe('TeamResourceModel', () => {
  it('orders sections and links deterministically and normalizes safe URLs', async () => {
    const later = await model.createSection({ name: ' Later ', position: 20, teamId });
    const earlier = await model.createSection({ name: 'Earlier', position: 10, teamId });
    const second = await model.createLink({
      position: 2,
      sectionId: earlier.id,
      teamId,
      title: 'Second',
      url: 'https://example.com/second',
    });
    const first = await model.createLink({
      position: 1,
      sectionId: earlier.id,
      teamId,
      title: ' First ',
      url: 'https://example.com/first',
    });

    const listed = await model.list(teamId);
    expect(listed.sections.map((section) => section.id)).toEqual([earlier.id, later.id]);
    expect(listed.resources.map((resource) => resource.id)).toEqual([first.id, second.id]);
    expect(listed.resources[0]).toMatchObject({
      title: 'First',
      url: 'https://example.com/first',
    });

    await expect(
      model.createLink({ teamId, title: 'Unsafe', url: 'https://user:secret@example.com' }),
    ).rejects.toThrow('without credentials');
    await expect(
      model.createLink({ teamId, title: 'Unsafe', url: 'javascript:alert(1)' }),
    ).rejects.toThrow('HTTP(S)');
  });

  it('moves resources and leaves them unsectioned when their section is deleted', async () => {
    const section = await model.createSection({ name: 'Reference', teamId });
    const link = await model.createLink({ teamId, url: 'https://example.com' });

    const moved = await model.moveResource({
      position: 8,
      resourceId: link.id,
      sectionId: section.id,
      teamId,
    });
    expect(moved).toMatchObject({ position: 8, sectionId: section.id });

    await model.deleteSection(teamId, section.id);
    expect((await model.list(teamId)).resources[0]).toMatchObject({ sectionId: null });
  });

  it('keeps every mutation inside its workspace and team scope', async () => {
    const section = await model.createSection({ name: 'Mine', teamId });
    const link = await model.createLink({ teamId, url: 'https://example.com' });
    const otherWorkspaceModel = new TeamResourceModel(db, otherId, otherWorkspaceId);

    expect(await otherWorkspaceModel.renameSection(teamId, section.id, 'Stolen')).toBeNull();
    expect(await otherWorkspaceModel.removeLink(teamId, link.id)).toBeNull();
    await expect(
      otherWorkspaceModel.createSection({ name: 'Cross workspace', teamId }),
    ).rejects.toThrow('Team not found');
    await expect(
      model.createLink({ teamId: otherTeamId, url: 'https://example.com/cross-team' }),
    ).rejects.toThrow('Team not found');
    expect(await model.renameSection(otherTeamId, section.id, 'Cross-team')).toBeNull();
    expect(await model.removeLink(otherTeamId, link.id)).toBeNull();

    expect((await model.list(teamId)).sections[0].name).toBe('Mine');
    expect((await model.list(teamId)).resources).toHaveLength(1);
  });

  it('attaches a public document once, rejects non-public documents, and detaches without deleting', async () => {
    await createDocument({ id: 'team-resource-public-doc' });
    await createDocument({ id: 'team-resource-private-doc', visibility: 'private' });
    await createDocument({
      id: 'team-resource-foreign-doc',
      userId: otherId,
      workspaceId: otherWorkspaceId,
    });

    const placement = await model.attachDocument({
      documentId: 'team-resource-public-doc',
      teamId,
    });
    await expect(
      model.attachDocument({ documentId: 'team-resource-public-doc', teamId }),
    ).rejects.toThrow(TEAM_RESOURCE_DOCUMENT_ALREADY_ATTACHED);
    await expect(
      model.attachDocument({ documentId: 'team-resource-private-doc', teamId }),
    ).rejects.toThrow(TEAM_RESOURCE_DOCUMENT_NOT_ATTACHABLE);
    await expect(
      model.attachDocument({ documentId: 'team-resource-foreign-doc', teamId }),
    ).rejects.toThrow(TEAM_RESOURCE_DOCUMENT_NOT_ATTACHABLE);

    await model.detachDocument(teamId, placement.id);
    const [document] = await db
      .select({ id: documents.id })
      .from(documents)
      .where(eq(documents.id, 'team-resource-public-doc'));
    expect(document).toEqual({ id: 'team-resource-public-doc' });
    expect(await model.list(teamId)).toMatchObject({ resources: [] });
  });

  it('places only a team-owned team-visible document in its owning team', async () => {
    await createDocument({
      id: 'team-resource-team-doc',
      teamId,
      visibility: 'team',
    });
    const resource = await model.placeTeamDocument({
      documentId: 'team-resource-team-doc',
      teamId,
    });
    expect(resource.documentId).toBe('team-resource-team-doc');
    await expect(model.detachDocument(teamId, resource.id)).rejects.toThrow(
      TEAM_RESOURCE_OWNED_DOCUMENT,
    );
    expect((await model.list(teamId)).resources.map((row) => row.id)).toContain(resource.id);

    await expect(
      new TeamResourceModel(db, otherId, otherWorkspaceId).placeTeamDocument({
        documentId: 'team-resource-team-doc',
        teamId: otherTeamId,
      }),
    ).rejects.toThrow(TEAM_RESOURCE_DOCUMENT_NOT_ATTACHABLE);
  });

  it('does not let link operations mutate a document placement', async () => {
    await createDocument({ id: 'team-resource-link-guard-doc' });
    const placement = await model.attachDocument({
      documentId: 'team-resource-link-guard-doc',
      teamId,
    });

    expect(
      await model.updateLink(teamId, placement.id, { url: 'https://example.com/replaced' }),
    ).toBeNull();
    expect(await model.removeLink(teamId, placement.id)).toBeNull();
    expect((await db.select().from(teamResourcePlacements)).map((row) => row.id)).toContain(
      placement.id,
    );
  });
});
