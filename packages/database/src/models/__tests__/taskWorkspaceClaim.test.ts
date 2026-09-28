// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '../../core/getTestDB';
import { taskWorkspaceClaims } from '../../schemas';
import type { OrviloDatabase } from '../../type';
import { taskWorkspaceClaimKey, TaskWorkspaceClaimModel } from '../taskWorkspaceClaim';

const serverDB: OrviloDatabase = await getTestDB();
const model = new TaskWorkspaceClaimModel(serverDB);

const CLAIM_PARAMS = {
  baseBranch: 'main',
  deviceId: 'dev-1',
  dispatchId: 'disp-1',
  expectedBaseSha: 'sha-base-1',
  generation: 1,
  ownerToken: 'tok-1',
  repoCommonDir: '/repos/orvilo/.git',
  repoPath: '/repos/orvilo',
  taskId: 'task_1',
  worktreePath: '/repos/orvilo-task-T-1@task_1',
};

const cleanup = async () => {
  await serverDB.delete(taskWorkspaceClaims);
};

beforeEach(cleanup);
afterEach(cleanup);

describe('taskWorkspaceClaimKey', () => {
  it('binds the device-proven canonical identity, not the requested spellings', () => {
    // Two spellings of one physical directory collapse onto one key — the
    // caller must canonicalize before keying, so aliased requests share a
    // claim instead of splitting it.
    const direct = taskWorkspaceClaimKey({
      deviceId: 'dev-1',
      repoCommonDir: '/repos/orvilo/.git',
      worktreePath: '/repos/orvilo-task',
    });
    const aliased = taskWorkspaceClaimKey({
      deviceId: 'dev-1',
      repoCommonDir: '/private/repos/orvilo/.git',
      worktreePath: '/link/orvilo-task',
    });
    expect(direct).toBe('dev-1:/repos/orvilo/.git::/repos/orvilo-task');
    expect(aliased).not.toBe(direct);
  });
});

describe('TaskWorkspaceClaimModel', () => {
  it('mints a claim with its pinned base and repo common-dir', async () => {
    const row = await model.mint(CLAIM_PARAMS);

    expect(row.key).toBe('dev-1:/repos/orvilo/.git::/repos/orvilo-task-T-1@task_1');
    expect(row.ownerToken).toBe('tok-1');
    expect(row.baseBranch).toBe('main');
    expect(row.expectedBaseSha).toBe('sha-base-1');
    expect(row.repoCommonDir).toBe('/repos/orvilo/.git');
    expect(row.releasedAt).toBeNull();
  });

  it('returns the live foreign row untouched on a conflicting mint', async () => {
    const first = await model.mint(CLAIM_PARAMS);
    const second = await model.mint({
      ...CLAIM_PARAMS,
      dispatchId: 'disp-2',
      expectedBaseSha: 'sha-other',
      ownerToken: 'tok-2',
    });

    // A foreign dispatch never overwrites the live claim — it reads the
    // winner back so the caller sees the conflict.
    expect(second.id).toBe(first.id);
    expect(second.ownerToken).toBe('tok-1');
    expect(second.expectedBaseSha).toBe('sha-base-1');
  });

  it('reclaims a released row for a new owner', async () => {
    const first = await model.mint(CLAIM_PARAMS);
    await model.release(first.key, 'tok-1');

    const reclaimed = await model.mint({
      ...CLAIM_PARAMS,
      baseBranch: 'develop',
      dispatchId: 'disp-2',
      expectedBaseSha: 'sha-base-2',
      ownerToken: 'tok-2',
    });

    expect(reclaimed.id).toBe(first.id);
    expect(reclaimed.ownerToken).toBe('tok-2');
    expect(reclaimed.dispatchId).toBe('disp-2');
    expect(reclaimed.baseBranch).toBe('develop');
    expect(reclaimed.expectedBaseSha).toBe('sha-base-2');
    expect(reclaimed.releasedAt).toBeNull();
  });

  it('release is fenced on the owner token — a stale token cannot release', async () => {
    const first = await model.mint(CLAIM_PARAMS);
    await model.release(first.key, 'tok-stale');

    const still = await model.lookup(first.key);
    expect(still?.releasedAt).toBeNull();

    await model.release(first.key, 'tok-1');
    const released = await model.lookup(first.key);
    expect(released?.releasedAt).not.toBeNull();
  });
});
