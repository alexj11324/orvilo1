import { createHash } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '../../core/getTestDB';
import {
  agents,
  projects,
  users,
  workspaceInvitationProjects,
  workspaceInvitations,
  workspaces,
} from '../../schemas';
import type { OrviloDatabase } from '../../type';
import { normalizeEmail, WorkspaceInvitationModel } from '../workspaceInvitation';

const serverDB: OrviloDatabase = await getTestDB();

const inviterId = 'wi-inviter';
const inviteeId = 'wi-invitee';
const workspaceId = 'wi-workspace';
const projectId = 'wi-project';
const coordinatorAgentId = 'wi-coordinator';

const sha256Hex = (value: string) => createHash('sha256').update(value).digest('hex');

beforeEach(async () => {
  await serverDB.delete(users);
  await serverDB.insert(users).values([{ id: inviterId }, { id: inviteeId }]);
  await serverDB
    .insert(workspaces)
    .values({ id: workspaceId, name: 'WS', primaryOwnerId: inviterId, slug: 'wi-ws' });
  await serverDB
    .insert(agents)
    .values({ id: coordinatorAgentId, slug: coordinatorAgentId, userId: inviterId });
  await serverDB.insert(projects).values({
    coordinatorAgentId,
    id: projectId,
    identifier: 'WIP',
    name: 'WI project',
    userId: inviterId,
    workspaceId,
  });
});

afterEach(async () => {
  await serverDB.delete(users);
});

describe('WorkspaceInvitationModel', () => {
  describe('normalizeEmail', () => {
    it('lowercases and trims only — dots and +tags are preserved', () => {
      expect(normalizeEmail('  Alice.B+Team@Example.COM ')).toBe('alice.b+team@example.com');
      expect(WorkspaceInvitationModel.normalizeEmail('A@B.COM')).toBe('a@b.com');
    });
  });

  describe('createInvitation', () => {
    it('returns the raw token once and persists only its SHA-256 digest', async () => {
      const model = new WorkspaceInvitationModel(serverDB, inviterId);

      const { invitation, token } = await model.createInvitation({
        email: 'Person@Example.com',
        workspaceId,
      });

      expect(token).toBeTruthy();
      expect(invitation.token).toBeNull();
      expect(invitation.tokenHash).toBe(sha256Hex(token));
      expect(invitation.tokenHash).not.toBe(token);
      expect(invitation.emailNormalized).toBe('person@example.com');
      expect(invitation.generation).toBe(1);
      expect(invitation.status).toBe('pending');
      expect(invitation.lastSentAt).not.toBeNull();
    });

    it('stores the intended project grants in the same transaction', async () => {
      const model = new WorkspaceInvitationModel(serverDB, inviterId);

      const { invitation } = await model.createInvitation({
        projectGrants: [{ projectId, role: 'manager' }],
        workspaceId,
      });

      const grants = await serverDB
        .select()
        .from(workspaceInvitationProjects)
        .where(eq(workspaceInvitationProjects.invitationId, invitation.id));
      expect(grants).toHaveLength(1);
      expect(grants[0].projectId).toBe(projectId);
      expect(grants[0].role).toBe('manager');
    });
  });

  describe('findByToken', () => {
    it('round-trips: the issued raw token resolves the hashed row', async () => {
      const model = new WorkspaceInvitationModel(serverDB, inviterId);
      const { invitation, token } = await model.createInvitation({ workspaceId });

      const found = await model.findByToken(token);

      expect(found?.id).toBe(invitation.id);
    });

    it('returns undefined for a wrong or empty token', async () => {
      const model = new WorkspaceInvitationModel(serverDB, inviterId);
      await model.createInvitation({ workspaceId });

      expect(await model.findByToken('wrong-token')).toBeUndefined();
      expect(await model.findByToken('')).toBeUndefined();
    });

    it('lazily marks a past-due pending invitation expired', async () => {
      const model = new WorkspaceInvitationModel(serverDB, inviterId);
      const { invitation, token } = await model.createInvitation({ workspaceId });
      await serverDB
        .update(workspaceInvitations)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(workspaceInvitations.id, invitation.id));

      const found = await model.findByToken(token);

      expect(found?.status).toBe('expired');
    });
  });

  describe('markAccepted', () => {
    it('consumes a pending invitation exactly once', async () => {
      const model = new WorkspaceInvitationModel(serverDB, inviterId);
      const { invitation } = await model.createInvitation({ workspaceId });

      const first = await model.markAccepted(invitation.id, { acceptedBy: inviteeId });
      const second = await model.markAccepted(invitation.id, { acceptedBy: inviteeId });

      expect(first).toBe(true);
      // Replay is a no-op: a consumed invitation cannot be accepted twice.
      expect(second).toBe(false);
      const [row] = await serverDB
        .select()
        .from(workspaceInvitations)
        .where(eq(workspaceInvitations.id, invitation.id));
      expect(row.status).toBe('accepted');
      expect(row.acceptedBy).toBe(inviteeId);
      expect(row.acceptedAt).not.toBeNull();
    });

    it('refuses acceptance against a stale generation', async () => {
      const model = new WorkspaceInvitationModel(serverDB, inviterId);
      const { invitation } = await model.createInvitation({ workspaceId });
      await model.rotateToken(invitation.id);

      const accepted = await model.markAccepted(invitation.id, {
        acceptedBy: inviteeId,
        generation: 1,
      });

      expect(accepted).toBe(false);
    });
  });

  describe('rotateToken', () => {
    it('invalidates the old link: generation bumps and the old hash dies', async () => {
      const model = new WorkspaceInvitationModel(serverDB, inviterId);
      const { invitation, token: oldToken } = await model.createInvitation({ workspaceId });

      const newToken = await model.rotateToken(invitation.id);

      expect(newToken).toBeTruthy();
      expect(newToken).not.toBe(oldToken);
      const [row] = await serverDB
        .select()
        .from(workspaceInvitations)
        .where(eq(workspaceInvitations.id, invitation.id));
      expect(row.generation).toBe(2);
      expect(row.tokenHash).toBe(sha256Hex(newToken!));
      expect(row.token).toBeNull();
      // The previously mailed link is dead …
      expect(await model.findByToken(oldToken)).toBeUndefined();
      // … and the new one resolves.
      expect((await model.findByToken(newToken!))?.id).toBe(invitation.id);
    });
  });

  describe('revoke', () => {
    it('revokes a pending invitation once and blocks later acceptance', async () => {
      const model = new WorkspaceInvitationModel(serverDB, inviterId);
      const { invitation } = await model.createInvitation({ workspaceId });

      expect(await model.revoke(invitation.id, { revokedBy: inviterId })).toBe(true);
      expect(await model.revoke(invitation.id, { revokedBy: inviterId })).toBe(false);
      // Revoked beats a racing accept.
      expect(await model.markAccepted(invitation.id, { acceptedBy: inviteeId })).toBe(false);

      const [row] = await serverDB
        .select()
        .from(workspaceInvitations)
        .where(eq(workspaceInvitations.id, invitation.id));
      expect(row.status).toBe('revoked');
      expect(row.revokedBy).toBe(inviterId);
      expect(row.revokedAt).not.toBeNull();
    });
  });

  describe('listPendingByWorkspace', () => {
    it('returns pending invitations with their project grants attached', async () => {
      const model = new WorkspaceInvitationModel(serverDB, inviterId);
      const { invitation } = await model.createInvitation({
        projectGrants: [{ projectId }],
        workspaceId,
      });
      await model.createInvitation({ workspaceId });

      const rows = await model.listPendingByWorkspace(workspaceId);

      expect(rows).toHaveLength(2);
      const withGrant = rows.find((row) => row.invitation.id === invitation.id);
      expect(withGrant?.projectGrants).toHaveLength(1);
      expect(withGrant?.projectGrants[0].projectId).toBe(projectId);
      const withoutGrant = rows.find((row) => row.invitation.id !== invitation.id);
      expect(withoutGrant?.projectGrants).toHaveLength(0);
    });
  });
});
