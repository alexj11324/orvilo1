// @vitest-environment node
import type { TaskItem } from '@orvilo/types';
import { expect, it, vi } from 'vitest';

import { taskRequiresBuiltinToolMount } from './toolMountRequirement';

vi.mock('@/database/models/task', () => ({
  TaskModel: class {
    getCheckpointConfig = () => ({ onAgentRequest: true });
  },
}));

it('does not gate ordinary Issue admission on an archived Verify policy', async () => {
  const task = { config: { verify: { enabled: true } } } as TaskItem;
  await expect(taskRequiresBuiltinToolMount({} as never, task, { userId: 'user' })).resolves.toBe(
    false,
  );
});
it('keeps agent-mode Brief admission independent of an archived rubric review flag', async () => {
  const task = { config: { brief: { mode: 'agent' }, review: { enabled: true } } } as TaskItem;
  await expect(taskRequiresBuiltinToolMount({} as never, task, { userId: 'user' })).resolves.toBe(
    true,
  );
});
