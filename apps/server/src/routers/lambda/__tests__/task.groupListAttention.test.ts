// @vitest-environment node
import { TASK_ATTENTION_REASONS } from '@orvilo/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TaskModel } from '@/database/models/task';
import type * as WorkspaceModelModule from '@/database/models/workspace';

import { taskRouter } from '../task';
import { createTestContext } from './integration/setup';

const mocks = vi.hoisted(() => ({ membershipRole: vi.fn() }));

vi.mock('@/database/core/db-adaptor', () => ({ getServerDB: () => ({}) }));
vi.mock('@/database/models/workspace', async (importOriginal) => ({
  ...(await importOriginal<typeof WorkspaceModelModule>()),
  getActiveWorkspaceMembershipRole: mocks.membershipRole,
}));

// Reads must never acquire the writable task permission. Keep this guard
// after authentication/membership, in the same position as the real router.
vi.mock('@/business/server/trpc-middlewares/rbacPermission', () => ({
  withScopedPermission: (action: string) => () => {
    throw new Error(`Unexpected write permission: ${action}`);
  },
}));

const caller = () =>
  taskRouter.createCaller({ ...createTestContext('reader'), workspaceId: 'workspace' });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.membershipRole.mockResolvedValue('member');
});

afterEach(() => vi.restoreAllMocks());

describe('task.groupList attention contract', () => {
  it('requires authentication before querying tasks', async () => {
    const groupList = vi.spyOn(TaskModel.prototype, 'groupList');
    const anonymous = taskRouter.createCaller({ workspaceId: 'workspace' } as never);

    await expect(
      anonymous.groupList({ groups: [{ key: 'legacy', statuses: ['backlog'] }] }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(groupList).not.toHaveBeenCalled();
    expect(mocks.membershipRole).not.toHaveBeenCalled();
  });

  it.each(['member', 'viewer'])('accepts attention-only groups for a %s', async (role) => {
    mocks.membershipRole.mockResolvedValue(role);
    const groupList = vi.spyOn(TaskModel.prototype, 'groupList').mockResolvedValue([]);
    vi.spyOn(TaskModel.prototype, 'derivedStatusByIds').mockResolvedValue({});
    const groups = [
      { attentionReasons: ['needs_input' as const], key: 'needs-input', limit: 20 },
      { attentionReasons: [...TASK_ATTENTION_REASONS], key: 'all-attention', limit: 50 },
    ];

    await expect(caller().groupList({ groups })).resolves.toEqual({ data: [], success: true });
    expect(groupList).toHaveBeenCalledExactlyOnceWith({
      groups: groups.map((group) => ({ ...group, offset: 0 })),
    });
  });

  it.each([
    ['assigned', 'assigneeUserId'],
    ['created', 'createdByUserId'],
    ['delegated', 'delegatedByUserId'],
  ] as const)('resolves %s scope to the authenticated reader', async (scope, field) => {
    const groupList = vi.spyOn(TaskModel.prototype, 'groupList').mockResolvedValue([]);
    vi.spyOn(TaskModel.prototype, 'derivedStatusByIds').mockResolvedValue({});
    const group = {
      attentionReasons: ['review_required' as const, 'needs_changes' as const],
      key: 'review',
      limit: 10,
      offset: 5,
    };

    await expect(
      caller().groupList({
        groups: [group],
        parentTaskId: null,
        projectId: null,
        scope,
        visibility: 'public',
      }),
    ).resolves.toEqual({ data: [], success: true });
    expect(groupList).toHaveBeenCalledExactlyOnceWith({
      [field]: 'reader',
      groups: [group],
      parentTaskId: null,
      projectId: null,
      visibility: 'public',
    });
  });

  it.each([
    { key: 'legacy-status', statuses: ['backlog' as const] },
    { key: 'legacy-workflow', workflowCategories: ['triage' as const] },
  ])('continues accepting $key groups', async (group) => {
    const groupList = vi.spyOn(TaskModel.prototype, 'groupList').mockResolvedValue([]);
    vi.spyOn(TaskModel.prototype, 'derivedStatusByIds').mockResolvedValue({});

    await expect(caller().groupList({ groups: [group] })).resolves.toEqual({
      data: [],
      success: true,
    });
    expect(groupList).toHaveBeenCalledExactlyOnceWith({
      groups: [{ ...group, limit: 50, offset: 0 }],
    });
  });

  it('rejects an unknown attention reason even alongside a valid status', async () => {
    const groupList = vi.spyOn(TaskModel.prototype, 'groupList').mockResolvedValue([]);
    vi.spyOn(TaskModel.prototype, 'derivedStatusByIds').mockResolvedValue({});
    await expect(
      caller().groupList({
        groups: [
          {
            // @ts-expect-error Exercise invalid input received over the wire.
            attentionReasons: ['unknown-attention'],
            key: 'invalid',
            statuses: ['backlog'],
          },
        ],
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(groupList).not.toHaveBeenCalled();
  });

  it.each([
    { key: 'empty' },
    { attentionReasons: [], key: 'empty-attention', statuses: [], workflowCategories: [] },
  ])('rejects $key groups before querying tasks', async (group) => {
    const groupList = vi.spyOn(TaskModel.prototype, 'groupList');
    await expect(caller().groupList({ groups: [group] })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
    expect(groupList).not.toHaveBeenCalled();
  });
});
