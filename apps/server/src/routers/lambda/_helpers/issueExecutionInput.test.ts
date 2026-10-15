// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';

import { assertIssueExecutionInput } from './issueExecutionInput';
import { assertCanUseWorkspaceAgent } from './workspaceAgentGuard';

vi.mock('./workspaceAgentGuard', () => ({ assertCanUseWorkspaceAgent: vi.fn() }));
const ctx = { serverDB: {} as never, userId: 'member', workspaceId: 'workspace' };
beforeEach(() => vi.mocked(assertCanUseWorkspaceAgent).mockReset());

it('requires the current human assignee and active Agent Use', async () => {
  const task = { assigneeAgentId: 'agent', assigneeUserId: 'other' };
  await expect(assertIssueExecutionInput(ctx, task)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  task.assigneeUserId = 'member';
  vi.mocked(assertCanUseWorkspaceAgent).mockRejectedValueOnce(new Error('Use revoked'));
  await expect(assertIssueExecutionInput(ctx, task)).rejects.toThrow('Use revoked');
  await expect(assertIssueExecutionInput(ctx, task)).resolves.toBeUndefined();
});

it('permits authorized users of the assigned Agent without selecting a single approver', async () => {
  const task = { assigneeAgentId: 'agent', assigneeUserId: null };
  await expect(assertIssueExecutionInput(ctx, task, 'other-agent')).rejects.toMatchObject({
    code: 'FORBIDDEN',
  });
  await expect(assertIssueExecutionInput(ctx, task)).resolves.toBeUndefined();
  await expect(
    assertIssueExecutionInput({ ...ctx, userId: 'teammate' }, task),
  ).resolves.toBeUndefined();
});
