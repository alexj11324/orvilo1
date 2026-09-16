from pathlib import Path

def edit(path, old, new):
    p=Path(path); s=p.read_text()
    if s.count(old)!=1: raise RuntimeError(f'{path}: expected one match for {old[:80]}')
    p.write_text(s.replace(old,new,1))

p='apps/server/src/services/toolExecution/serverRuntimes/task.ts'
edit(p, '''      // Tear down provisioned run worktrees before the task_topics rows
      // cascade away with the task. Best-effort — never blocks the delete.
      if (deps.db && deps.userId) {
        const workspaceId = deps.workspaceId ?? (await resolveWorkspaceId(deps.db, task.id));
        await new TaskIntegrationService(deps.db, deps.userId, workspaceId).cleanupTaskWorktrees(
          task.id,
        );
      }

      await taskModel().delete(task.id);''', '''      let integration: TaskIntegrationService | undefined;
      let snapshot: Awaited<ReturnType<TaskIntegrationService['snapshotTaskWorktrees']>> | undefined;
      if (deps.db && deps.userId) {
        const workspaceId = deps.workspaceId ?? (await resolveWorkspaceId(deps.db, task.id));
        integration = new TaskIntegrationService(deps.db, deps.userId, workspaceId);
        snapshot = await integration.snapshotTaskWorktrees(task.id);
      }

      // The model checks dependencies atomically. Never destroy worktrees or
      // report a successful deletion when that guard rejects or the row is gone.
      const deleted = await taskModel().delete(task.id);
      if (!deleted) return { content: `Task not found: ${args.identifier}`, success: false };
      if (integration && snapshot) await integration.cleanupTaskWorktrees(task.id, snapshot);''')

p='apps/server/src/services/toolExecution/serverRuntimes/__tests__/task.test.ts'
edit(p,"import { createTaskRuntime, taskRuntime } from '../task';", "import { TaskDependencyError } from '@/database/models/taskDependency';\n\nimport { createTaskRuntime, taskRuntime } from '../task';")
edit(p,"  TaskIntegrationService: vi.fn(() => ({ cleanupTaskWorktrees: vi.fn() })),", "  TaskIntegrationService: vi.fn(() => deletionMocks),")
edit(p, "const verifyMocks = vi.hoisted(() => ({ createCriteriaFromDrafts: vi.fn() }));", """const verifyMocks = vi.hoisted(() => ({ createCriteriaFromDrafts: vi.fn() }));
const deletionMocks = vi.hoisted(() => ({
  cleanupTaskWorktrees: vi.fn(),
  snapshotTaskWorktrees: vi.fn(),
}));""")
with Path(p).open('a') as f: f.write('''

describe('agent-tool deletion prerequisite guard', () => {
  const task = { id: 'task-delete', identifier: 'T-99', name: 'Delete fixture' };
  const fixture = (remove: ReturnType<typeof vi.fn>) => createTaskRuntime({
    db: {} as never,
    userId: 'owner',
    workspaceId: 'workspace',
    agentModel: {} as never,
    taskModel: { resolve: vi.fn().mockResolvedValue(task), delete: remove } as never,
    taskService: {} as never,
  });

  beforeEach(() => {
    deletionMocks.snapshotTaskWorktrees.mockReset().mockResolvedValue([]);
    deletionMocks.cleanupTaskWorktrees.mockReset().mockResolvedValue(undefined);
  });

  it('preserves the worktree when an inbound dependency rejects deletion', async () => {
    const remove = vi.fn().mockRejectedValue(new TaskDependencyError('Remove dependency links'));
    await expect(fixture(remove).deleteTask({ identifier: task.identifier })).rejects.toThrow('dependency links');
    expect(deletionMocks.cleanupTaskWorktrees).not.toHaveBeenCalled();
  });

  it('cleans up from the snapshot only after a successful guarded delete', async () => {
    const remove = vi.fn().mockResolvedValue(true);
    const result = await fixture(remove).deleteTask({ identifier: task.identifier });
    expect(result.success).toBe(true);
    expect(deletionMocks.cleanupTaskWorktrees).toHaveBeenCalledWith(task.id, []);
    expect(deletionMocks.snapshotTaskWorktrees.mock.invocationCallOrder[0]).toBeLessThan(remove.mock.invocationCallOrder[0]);
    expect(remove.mock.invocationCallOrder[0]).toBeLessThan(deletionMocks.cleanupTaskWorktrees.mock.invocationCallOrder[0]);
  });

  it('does not report deletion or clean up if the row was not deleted', async () => {
    const result = await fixture(vi.fn().mockResolvedValue(false)).deleteTask({ identifier: task.identifier });
    expect(result.success).toBe(false);
    expect(deletionMocks.cleanupTaskWorktrees).not.toHaveBeenCalled();
  });
});
''')
