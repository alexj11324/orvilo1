// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { runMemoryActionAgent } from '../userMemory';

const initModelRuntimeFromDeploymentConfigMock = vi.hoisted(() => vi.fn());
const memoryRuntimeFactoryMock = vi.hoisted(() => vi.fn());
const getAllIdentitiesWithMemoryMock = vi.hoisted(() => vi.fn());
const persistAgentSignalReceiptsMock = vi.hoisted(() => vi.fn());
const runAcpJudgmentMock = vi.hoisted(() => vi.fn());

vi.mock('@/server/modules/ModelRuntime', () => ({
  initModelRuntimeFromDeploymentConfig: initModelRuntimeFromDeploymentConfigMock,
}));

vi.mock('@/server/services/aiGeneration/judgment', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  runAcpJudgment: runAcpJudgmentMock,
}));

vi.mock('@/server/services/toolExecution/serverRuntimes/memory', () => ({
  memoryRuntime: { factory: memoryRuntimeFactoryMock },
}));

vi.mock('@/database/models/userMemory', () => ({
  UserMemoryModel: vi.fn().mockImplementation(function () {
    return { getAllIdentitiesWithMemory: getAllIdentitiesWithMemoryMock };
  }),
}));

vi.mock('@/server/services/agentSignal/services/receiptService', () => ({
  persistAgentSignalReceipts: persistAgentSignalReceiptsMock,
}));

const options = {
  db: {} as never,
  userId: 'user_1',
  workspaceId: 'ws_1',
};

const baseInput = {
  agentId: 'agent_1',
  message: 'Going forward, keep code review comments concise.',
  topicId: 'topic_1',
};

describe('runMemoryActionAgent', () => {
  it('skips automatic memory writing before invoking model or memory tools', async () => {
    vi.clearAllMocks();
    const result = await runMemoryActionAgent(baseInput, options);
    expect(result.status).toBe('skipped');
    expect(memoryRuntimeFactoryMock).not.toHaveBeenCalled();
    expect(runAcpJudgmentMock).not.toHaveBeenCalled();
    expect(persistAgentSignalReceiptsMock).not.toHaveBeenCalled();
  });
});
