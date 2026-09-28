// @vitest-environment node
import { randomBytes } from 'node:crypto';

import { inArray } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '../../core/getTestDB';
import { credentials, users, workspaces } from '../../schemas';
import type { OrviloDatabase } from '../../type';
import { CredentialModel, toOwnCredSummary } from '../credential';

const serverDB: OrviloDatabase = await getTestDB();

const ownerId = 'cred-model-owner';
const memberId = 'cred-model-member';
const outsiderId = 'cred-model-outsider';
const workspaceId = 'cred-model-workspace';
const otherWorkspaceId = 'cred-model-other-workspace';
// Generated per run instead of a checked-in fixture so no key material sits in the repo.
const validKeyVaultsSecret = randomBytes(32).toString('base64');

const ownerModel = new CredentialModel(serverDB, ownerId);
const memberModel = new CredentialModel(serverDB, memberId);
const outsiderModel = new CredentialModel(serverDB, outsiderId);

let originalKeyVaultsSecret: string | undefined;

const createPersonal = (
  model: CredentialModel,
  key: string,
  overrides: Partial<Parameters<CredentialModel['create']>[0]> = {},
) =>
  model.create({
    key,
    name: `${key} cred`,
    payload: { values: { token: `secret-${key}` } },
    type: 'kv-env',
    ...overrides,
  });

const createWorkspaceRow = (model: CredentialModel, key: string) =>
  createPersonal(model, key, { visibility: 'public', workspaceId });

const cleanup = async () => {
  await serverDB
    .delete(credentials)
    .where(inArray(credentials.ownerUserId, [ownerId, memberId, outsiderId]));
  await serverDB.delete(workspaces).where(inArray(workspaces.id, [workspaceId, otherWorkspaceId]));
  await serverDB.delete(users).where(inArray(users.id, [ownerId, memberId, outsiderId]));
};

beforeEach(async () => {
  originalKeyVaultsSecret = process.env.KEY_VAULTS_SECRET;
  process.env.KEY_VAULTS_SECRET = validKeyVaultsSecret;

  await cleanup();
  await serverDB
    .insert(users)
    .values([
      { email: 'owner@cred.test', fullName: 'Cred Owner', id: ownerId },
      { email: 'member@cred.test', fullName: 'Cred Member', id: memberId },
      { id: outsiderId },
    ]);
  await serverDB.insert(workspaces).values([
    { id: workspaceId, name: 'Creds WS', primaryOwnerId: ownerId, slug: workspaceId },
    {
      id: otherWorkspaceId,
      name: 'Other WS',
      primaryOwnerId: outsiderId,
      slug: otherWorkspaceId,
    },
  ]);
});

afterEach(async () => {
  await cleanup();
  process.env.KEY_VAULTS_SECRET = originalKeyVaultsSecret;
});

describe('CredentialModel', () => {
  describe('create + decryptPayload', () => {
    it('stores the payload encrypted and round-trips it', async () => {
      const row = await createPersonal(ownerModel, 'github');

      expect(row.id).toMatch(/^cred_/);
      expect(row.workspaceId).toBeNull();
      expect(row.ownerUserId).toBe(ownerId);
      expect(row.payload).not.toContain('secret-github');

      await expect(ownerModel.decryptPayload(row)).resolves.toEqual({
        values: { token: 'secret-github' },
      });
    });

    it('pins workspace-owned rows to the workspace', async () => {
      const row = await createWorkspaceRow(ownerModel, 'org-key');
      expect(row.workspaceId).toBe(workspaceId);
      expect(row.visibility).toBe('public');
    });
  });

  describe('personal scope', () => {
    it('lists only the caller-owned non-workspace rows', async () => {
      await createPersonal(ownerModel, 'mine');
      await createPersonal(memberModel, 'theirs');
      await createWorkspaceRow(ownerModel, 'org-only');

      const rows = await ownerModel.listPersonal();
      expect(rows.map((row) => row.key)).toEqual(['mine']);
    });

    it('scopes find/update/delete to the owner', async () => {
      const row = await createPersonal(ownerModel, 'scoped');

      await expect(memberModel.findPersonalByKey('scoped')).resolves.toBeUndefined();
      await expect(memberModel.findPersonalById(row.id)).resolves.toBeUndefined();
      await expect(memberModel.updatePersonal(row.id, { name: 'hijack' })).resolves.toEqual([]);
      await expect(memberModel.deletePersonal(row.id)).resolves.toEqual([]);
      await expect(ownerModel.findPersonalByKey('scoped')).resolves.toMatchObject({
        id: row.id,
      });
    });

    it('deletes by key within the personal scope only', async () => {
      await createWorkspaceRow(ownerModel, 'same-key');
      const personal = await createPersonal(ownerModel, 'same-key');

      const deleted = await ownerModel.deletePersonalByKey('same-key');
      expect(deleted).toEqual([{ id: personal.id }]);
      await expect(
        ownerModel.findWorkspaceOwnedByKey('same-key', workspaceId),
      ).resolves.toBeDefined();
    });
  });

  describe('share lifecycle', () => {
    it('shares, publishes and unshares a personal row', async () => {
      const row = await createPersonal(ownerModel, 'shared');

      const shared = await ownerModel.share(row.id, workspaceId, 'private');
      expect(shared?.sharedWorkspaceId).toBe(workspaceId);
      expect(shared?.visibility).toBe('private');
      expect(shared?.sharedAt).toBeNull();

      const published = await ownerModel.publish(row.id);
      expect(published?.visibility).toBe('public');
      expect(published?.sharedAt).toBeInstanceOf(Date);

      const unshared = await ownerModel.unshare(row.id);
      expect(unshared?.sharedWorkspaceId).toBeNull();
      expect(unshared?.visibility).toBe('private');
      expect(unshared?.sharedAt).toBeNull();
    });

    it('cannot share a workspace-owned row through the personal lifecycle', async () => {
      const row = await createWorkspaceRow(ownerModel, 'org-share');
      await expect(ownerModel.share(row.id, otherWorkspaceId, 'public')).resolves.toBeUndefined();
    });
  });

  describe('workspace scope', () => {
    it('merges org-owned and readable member-shared rows with ownerType', async () => {
      await createWorkspaceRow(ownerModel, 'org-cred');
      const shared = await createPersonal(memberModel, 'member-shared');
      await memberModel.share(shared.id, workspaceId, 'public');
      // Owner-only draft link: not readable to other members.
      const draft = await createPersonal(memberModel, 'member-draft');
      await memberModel.share(draft.id, workspaceId, 'private');
      // Unshared personal row: never enters the workspace view.
      await createPersonal(memberModel, 'not-shared');

      const memberRows = await memberModel.listWorkspace(workspaceId);
      const byKey = Object.fromEntries(
        memberRows.map((row) => [row.key, toOwnCredSummary(row, row)]),
      );
      expect(Object.keys(byKey).sort()).toEqual(['member-draft', 'member-shared', 'org-cred']);
      expect(byKey['org-cred']!.ownerType).toBe('organization');
      expect(byKey['member-shared']!.ownerType).toBe('user');
      expect(byKey['org-cred']!.ownerDisplayName).toBe('Cred Owner');
      expect(byKey['member-shared']!.ownerDisplayName).toBeUndefined();

      const outsiderRows = await outsiderModel.listWorkspace(workspaceId);
      expect(outsiderRows.map((row) => row.key).sort()).toEqual(['member-shared', 'org-cred']);
    });

    it('keeps owned lookups pinned to workspace rows', async () => {
      const shared = await createPersonal(memberModel, 'member-key');
      await memberModel.share(shared.id, workspaceId, 'public');
      await createWorkspaceRow(ownerModel, 'org-key');

      await expect(
        memberModel.findWorkspaceOwnedById(shared.id, workspaceId),
      ).resolves.toBeUndefined();
      await expect(
        memberModel.findWorkspaceReadableById(shared.id, workspaceId),
      ).resolves.toMatchObject({ id: shared.id });
      await expect(
        memberModel.findWorkspaceOwnedByKey('org-key', workspaceId),
      ).resolves.toMatchObject({ key: 'org-key' });
      await expect(
        memberModel.findWorkspaceReadableByKey('member-key', workspaceId),
      ).resolves.toMatchObject({ key: 'member-key' });
    });

    it('resolves readable keys for runtime inject but never foreign shares', async () => {
      await createWorkspaceRow(ownerModel, 'org-key');
      const shared = await createPersonal(memberModel, 'shared-key');
      await memberModel.share(shared.id, workspaceId, 'public');
      const foreign = await createPersonal(memberModel, 'foreign-key');
      await memberModel.share(foreign.id, otherWorkspaceId, 'public');

      const rows = await memberModel.findWorkspaceReadableByKeys(
        ['org-key', 'shared-key', 'foreign-key'],
        workspaceId,
      );
      expect(rows.map((row) => row.key).sort()).toEqual(['org-key', 'shared-key']);
    });

    it('scopes workspace manage updates to owned rows', async () => {
      const shared = await createPersonal(memberModel, 'shared-edit');
      await memberModel.share(shared.id, workspaceId, 'public');

      await expect(
        memberModel.updateWorkspaceOwned(shared.id, workspaceId, { name: 'hijack' }),
      ).resolves.toEqual([]);
      await expect(memberModel.deleteWorkspaceOwned(shared.id, workspaceId)).resolves.toEqual([]);
    });
  });

  describe('touchLastUsed', () => {
    it('stamps lastUsedAt on the given rows', async () => {
      const row = await createPersonal(ownerModel, 'used');
      expect(row.lastUsedAt).toBeNull();

      await ownerModel.touchLastUsed([row.id]);
      const updated = await ownerModel.findPersonalById(row.id);
      expect(updated?.lastUsedAt).toBeInstanceOf(Date);
    });
  });
});

describe('toOwnCredSummary', () => {
  it('maps a row without exposing the payload', async () => {
    const row = await createPersonal(ownerModel, 'summary', {
      description: 'desc',
      maskedPreview: 'tok****1234',
    });

    const summary = toOwnCredSummary(row, { activeWorkspaceId: workspaceId });
    expect(summary).toMatchObject({
      description: 'desc',
      id: row.id,
      key: 'summary',
      maskedPreview: 'tok****1234',
      ownerType: 'user',
      ownerUserId: ownerId,
      sharedToActiveWorkspace: false,
      visibility: 'private',
    });
    expect(summary).not.toHaveProperty('payload');
  });

  it('flags sharedToActiveWorkspace for the active workspace', async () => {
    const row = await createPersonal(ownerModel, 'shared-flag');
    await ownerModel.share(row.id, workspaceId, 'public');
    const shared = await ownerModel.findPersonalById(row.id);

    const summary = toOwnCredSummary(shared!, { activeWorkspaceId: workspaceId });
    expect(summary.sharedToActiveWorkspace).toBe(true);
    expect(summary.sharedWorkspaceId).toBe(workspaceId);
    expect(summary.visibility).toBe('public');
  });

  it('reports org-owned rows as organization ownerType', async () => {
    const row = await createWorkspaceRow(ownerModel, 'org-summary');
    const summary = toOwnCredSummary(row);
    expect(summary.ownerType).toBe('organization');
  });
});
