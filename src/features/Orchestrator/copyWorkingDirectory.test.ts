import { expect, it, vi } from 'vitest';

import { copyOrchestratorWorkingDirectory } from './copyWorkingDirectory';

const state = vi.hoisted(() => ({
  localAgentWorkingDirectoryMap: { source: '/repos/journey-demo' } as Record<string, string>,
  updateAgentRuntimeEnvConfigById: vi.fn(),
}));
vi.mock('@/store/agent', () => ({ useAgentStore: { getState: () => state } }));
vi.mock('@/store/agent/utils/localAgentWorkingDirectoryStorage', () => ({
  getLocalAgentWorkingDirectory: vi.fn(),
}));

it('copies the personal directory once into the owned coordinator without changing the source or making a live alias', async () => {
  await copyOrchestratorWorkingDirectory('source', 'owned-coordinator');
  expect(state.updateAgentRuntimeEnvConfigById).toHaveBeenCalledWith('owned-coordinator', {
    workingDirectory: '/repos/journey-demo',
  });
  state.localAgentWorkingDirectoryMap.source = '/repos/later';
  expect(state.updateAgentRuntimeEnvConfigById).toHaveBeenCalledTimes(1);
  expect(state.updateAgentRuntimeEnvConfigById.mock.calls[0][1].workingDirectory).toBe(
    '/repos/journey-demo',
  );
});
