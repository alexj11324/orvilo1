// @vitest-environment node
import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '../../core/getTestDB';
import { documents, teamMembers, teams, users, workspaceMembers, workspaces } from '../../schemas';
import type { OrviloDatabase } from '../../type';
import { DocumentModel } from '../document';
import { DocumentCommentModel } from '../documentComment';
import { DocumentHistoryModel } from '../documentHistory';
import { DocumentLikeModel } from '../documentLike';
import { RecentModel } from '../recent';
import { TeamResourceModel } from '../teamResource';

const db: OrviloDatabase = await getTestDB();
const author = 'team-doc-author';
const member = 'team-doc-member';
const outsider = 'team-doc-outsider';
const admin = 'team-doc-admin';
const legacyOwner = 'team-doc-legacy-owner';
let workspaceId: string;
let privateTeamId: string;
let publicTeamId: string;

beforeEach(async () => {
  await db
    .insert(users)
    .values([author, member, outsider, admin, legacyOwner].map((id) => ({ id })));
  const [workspace] = await db
    .insert(workspaces)
    .values({ name: 'Team document ACL', primaryOwnerId: admin, slug: 'team-document-acl' })
    .returning();
  workspaceId = workspace.id;
  await db.insert(workspaceMembers).values(
    [author, member, outsider, admin, legacyOwner].map((userId) => ({
      role: userId === admin ? ('owner' as const) : userId === legacyOwner ? 'admin' : 'member',
      userId,
      workspaceId,
    })),
  );
  await db
    .update(workspaceMembers)
    .set({ role: 'admin' })
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, admin)));
  await db
    .update(workspaceMembers)
    .set({ role: 'owner' })
    .where(
      and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, legacyOwner)),
    );
  const created = await db
    .insert(teams)
    .values([
      { key: 'PRV', name: 'Private', visibility: 'private', workspaceId },
      { key: 'PUB', name: 'Public', visibility: 'public', workspaceId },
    ])
    .returning();
  privateTeamId = created[0].id;
  publicTeamId = created[1].id;
  await db.insert(teamMembers).values([
    { teamId: privateTeamId, userId: author, workspaceId },
    { teamId: privateTeamId, userId: member, workspaceId },
    { teamId: publicTeamId, userId: author, workspaceId },
    { teamId: publicTeamId, userId: member, workspaceId },
  ]);
});

afterEach(async () => {
  await db.delete(documents);
  await db.delete(workspaces);
  await db.delete(users);
});

const createTeamPage = async (teamId: string) =>
  new DocumentModel(db, author, workspaceId).create({
    content: 'private team body',
    editorData: {},
    fileType: 'custom/document',
    source: 'document',
    sourceType: 'api',
    teamId,
    title: 'Team page',
    totalCharCount: 17,
    totalLineCount: 1,
    visibility: 'team',
  });

describe('team-owned document access', () => {
  it('shows a private-team Page to members and admin, then revokes its creator', async () => {
    const page = await createTeamPage(privateTeamId);
    const asMember = new DocumentModel(db, member, workspaceId);
    const asOutsider = new DocumentModel(db, outsider, workspaceId);
    const asAdmin = new DocumentModel(db, admin, workspaceId);
    const asLegacyOwner = new DocumentModel(db, legacyOwner, workspaceId);

    expect((await asMember.findById(page.id))?.id).toBe(page.id);
    expect((await asAdmin.findById(page.id))?.id).toBe(page.id);
    expect((await asLegacyOwner.findById(page.id))?.id).toBe(page.id);
    expect((await asLegacyOwner.findWritableById(page.id))?.id).toBe(page.id);
    expect(await asOutsider.findById(page.id)).toBeUndefined();
    expect((await asMember.query()).items.map((row) => row.id)).toContain(page.id);
    expect((await asOutsider.query()).items.map((row) => row.id)).not.toContain(page.id);

    await db
      .delete(teamMembers)
      .where(and(eq(teamMembers.teamId, privateTeamId), eq(teamMembers.userId, author)));
    expect(await new DocumentModel(db, author, workspaceId).findById(page.id)).toBeUndefined();
    expect(
      await new DocumentModel(db, author, workspaceId).findWritableById(page.id),
    ).toBeUndefined();
  });

  it('allows public-team workspace reads but restricts edits to members', async () => {
    const page = await createTeamPage(publicTeamId);
    const asOutsider = new DocumentModel(db, outsider, workspaceId);
    const asMember = new DocumentModel(db, member, workspaceId);
    expect((await asOutsider.findById(page.id))?.id).toBe(page.id);
    expect(await asOutsider.findWritableById(page.id)).toBeUndefined();
    await asOutsider.update(page.id, { title: 'wrong' });
    expect((await asMember.findById(page.id))?.title).toBe('Team page');
    await asMember.update(page.id, { title: 'Edited by member' });
    expect((await asMember.findById(page.id))?.title).toBe('Edited by member');
  });

  it('hides team Pages from workspace-public agents, including their member caller', async () => {
    const page = await createTeamPage(privateTeamId);
    const publicAgent = new DocumentModel(db, member, workspaceId, 'public');
    expect(await publicAgent.findById(page.id)).toBeUndefined();
    expect((await publicAgent.query()).items.map((row) => row.id)).not.toContain(page.id);
  });

  it('keeps ACL metadata out of ordinary updates', async () => {
    const page = await createTeamPage(privateTeamId);
    await new DocumentModel(db, member, workspaceId).update(page.id, {
      teamId: null,
      visibility: 'public',
    });
    const [row] = await db.select().from(documents).where(eq(documents.id, page.id));
    expect(row.teamId).toBe(privateTeamId);
    expect(row.visibility).toBe('team');
  });

  it('removes team Page titles from Recent immediately after membership revocation', async () => {
    const page = await createTeamPage(privateTeamId);
    const recent = new RecentModel(db, member, workspaceId);
    expect((await recent.queryRecent(20, ['document'])).map((item) => item.id)).toContain(page.id);

    await db
      .delete(teamMembers)
      .where(and(eq(teamMembers.teamId, privateTeamId), eq(teamMembers.userId, member)));
    expect((await recent.queryRecent(20, ['document'])).map((item) => item.id)).not.toContain(
      page.id,
    );
  });

  it('revokes direct comment and history reads with team membership', async () => {
    const page = await createTeamPage(privateTeamId);
    const memberComments = new DocumentCommentModel(db, member, workspaceId);
    const created = await memberComments.create({
      clientId: 'team-comment-client',
      content: 'Team discussion',
      documentId: page.id,
    });
    const authorHistory = new DocumentHistoryModel(db, author, workspaceId);
    const history = await authorHistory.create({
      documentId: page.id,
      editorData: { type: 'doc' },
      saveSource: 'manual',
      savedAt: new Date(),
    });
    const memberHistory = new DocumentHistoryModel(db, member, workspaceId);
    expect((await memberComments.findById(created.comment.id))?.id).toBe(created.comment.id);
    expect((await memberHistory.findById(history.id))?.id).toBe(history.id);

    await db
      .delete(teamMembers)
      .where(and(eq(teamMembers.teamId, privateTeamId), eq(teamMembers.userId, member)));
    expect(await memberComments.findById(created.comment.id)).toBeUndefined();
    expect(await memberHistory.findById(history.id)).toBeUndefined();
    expect(await memberHistory.listByDocumentId(page.id)).toEqual([]);
  });

  it('rejects likes and like summaries after a member is revoked', async () => {
    const page = await createTeamPage(privateTeamId);
    const likes = new DocumentLikeModel(db, member, workspaceId);
    expect((await likes.like(page.id)).summary.liked).toBe(true);
    await db
      .delete(teamMembers)
      .where(and(eq(teamMembers.teamId, privateTeamId), eq(teamMembers.userId, member)));
    await expect(likes.summary(page.id)).rejects.toThrow('Document not found');
    await expect(likes.unlike(page.id)).rejects.toThrow('Document not found');
  });

  it('keeps a placed team Page team-owned when its creator tries to publish it', async () => {
    const page = await createTeamPage(privateTeamId);
    const resources = new TeamResourceModel(db, author, workspaceId);
    const placement = await resources.placeTeamDocument({
      documentId: page.id,
      teamId: privateTeamId,
    });
    await expect(
      new DocumentModel(db, author, workspaceId).setVisibility(page.id, 'public'),
    ).rejects.toThrow('Document not found');
    const [unchanged] = await db.select().from(documents).where(eq(documents.id, page.id));
    expect(unchanged).toMatchObject({ teamId: privateTeamId, visibility: 'team' });
    expect((await resources.list(privateTeamId)).resources.map((row) => row.id)).toContain(
      placement.id,
    );
    expect(await new DocumentModel(db, outsider, workspaceId).findById(page.id)).toBeUndefined();
  });

  it('keeps a member from deleting a team Page while its creator and admin can manage it', async () => {
    const page = await createTeamPage(privateTeamId);
    await new DocumentModel(db, member, workspaceId).delete(page.id);
    expect((await new DocumentModel(db, author, workspaceId).findById(page.id))?.id).toBe(page.id);
    await new DocumentModel(db, admin, workspaceId).delete(page.id);
    expect(await new DocumentModel(db, author, workspaceId).findById(page.id)).toBeUndefined();
  });
});
