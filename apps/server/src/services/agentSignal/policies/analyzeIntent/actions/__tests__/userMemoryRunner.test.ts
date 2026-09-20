// @vitest-environment node
import { LayersEnum } from '@orvilo/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { runMemoryActionAgent } from '../userMemory';

const generateObjectMock = vi.hoisted(() => vi.fn());
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

const buildRuntime = () => ({
  addActivityMemory: vi.fn(),
  addContextMemory: vi.fn(),
  addExperienceMemory: vi.fn(),
  addIdentityMemory: vi.fn(),
  addPreferenceMemory: vi.fn(),
  queryTaxonomyOptions: vi.fn().mockResolvedValue({ content: '', state: {}, success: true }),
  removeIdentityMemory: vi.fn(),
  searchUserMemory: vi.fn().mockResolvedValue({ content: '', state: { items: [] }, success: true }),
  updateIdentityMemory: vi.fn(),
});

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
  beforeEach(() => {
    vi.clearAllMocks();
    initModelRuntimeFromDeploymentConfigMock.mockResolvedValue({
      generateObject: generateObjectMock,
    });
    // The write decision is a retained judgment; delegate it to the stubbed
    // decision generator so the harness never touches the real ACP binding.
    runAcpJudgmentMock.mockImplementation(
      async (_db: never, _userId: string, params: { input: unknown }) => ({
        data: await generateObjectMock(params.input),
        run: {},
      }),
    );
    getAllIdentitiesWithMemoryMock.mockResolvedValue([]);
    persistAgentSignalReceiptsMock.mockResolvedValue(undefined);
  });

  it('skips when no agentId is provided', async () => {
    const result = await runMemoryActionAgent({ ...baseInput, agentId: undefined }, options);

    expect(result).toEqual({ detail: 'Missing agentId for memory action.', status: 'skipped' });
    expect(initModelRuntimeFromDeploymentConfigMock).not.toHaveBeenCalled();
    expect(memoryRuntimeFactoryMock).not.toHaveBeenCalled();
  });

  it('skips when the decision model chooses "skip"', async () => {
    const runtime = buildRuntime();
    memoryRuntimeFactoryMock.mockResolvedValue(runtime);
    generateObjectMock.mockResolvedValue({
      action: 'skip',
      reasoning: 'Skill-management request, not a durable preference.',
    });

    const result = await runMemoryActionAgent(baseInput, options, {
      marker: { kind: 'memory', sourceId: 'source_1' },
    });

    expect(result).toEqual({
      detail: 'Skill-management request, not a durable preference.',
      status: 'skipped',
    });
    expect(runtime.addPreferenceMemory).not.toHaveBeenCalled();
    expect(runtime.addIdentityMemory).not.toHaveBeenCalled();
    expect(persistAgentSignalReceiptsMock).not.toHaveBeenCalled();
  });

  it('applies a preference write and projects a durable receipt', async () => {
    const runtime = buildRuntime();
    runtime.addPreferenceMemory.mockResolvedValue({
      content: 'Preference memory saved.',
      state: { memoryId: 'mem_1', preferenceId: 'pref_1' },
      success: true,
    });
    memoryRuntimeFactoryMock.mockResolvedValue(runtime);
    generateObjectMock.mockResolvedValue({
      action: 'addPreferenceMemory',
      params: {
        title: 'Prefers concise review comments',
        withPreference: { conclusionDirectives: 'Keep comments concise.' },
      },
    });

    const result = await runMemoryActionAgent(baseInput, options, {
      marker: {
        anchorMessageId: 'msg_assistant_1',
        kind: 'memory',
        sourceId: 'source_1:memory:msg_1',
        topicId: 'topic_1',
        triggerMessageId: 'msg_user_1',
      },
    });

    expect(runtime.addPreferenceMemory).toHaveBeenCalledWith({
      title: 'Prefers concise review comments',
      withPreference: { conclusionDirectives: 'Keep comments concise.' },
    });
    expect(result).toMatchObject({
      status: 'applied',
      target: {
        id: 'pref_1',
        memoryId: 'mem_1',
        memoryLayer: LayersEnum.Preference,
        title: 'Prefers concise review comments',
        type: 'memory',
      },
    });

    expect(persistAgentSignalReceiptsMock).toHaveBeenCalledTimes(1);
    const receipts = persistAgentSignalReceiptsMock.mock.calls[0][0];
    expect(receipts).toEqual([
      expect.objectContaining({
        anchorMessageId: 'msg_assistant_1',
        kind: 'memory',
        sourceId: 'source_1:memory:msg_1',
        status: 'applied',
        triggerMessageId: 'msg_user_1',
      }),
    ]);
  });

  it('uses an existing identity id for update decisions', async () => {
    getAllIdentitiesWithMemoryMock.mockResolvedValue([
      {
        identity: { id: 'identity-7', type: 'professional' },
        memory: { title: 'Maintains Orvilo Agent Signal' },
      },
    ]);
    const runtime = buildRuntime();
    runtime.updateIdentityMemory.mockResolvedValue({
      content: 'Identity memory updated.',
      state: { identityId: 'identity-7', memoryId: 'mem_9' },
      success: true,
    });
    memoryRuntimeFactoryMock.mockResolvedValue(runtime);
    generateObjectMock.mockResolvedValue({
      action: 'updateIdentityMemory',
      params: {
        id: 'identity-7',
        mergeStrategy: 'replace',
        set: {
          details: 'User clarified their Agent Signal ownership.',
          title: 'Maintains Agent Signal',
        },
      },
    });

    const result = await runMemoryActionAgent(baseInput, options);

    // Existing identities are surfaced to the decision model so update/remove
    // pick a real id instead of hallucinating one.
    const prompt = generateObjectMock.mock.calls[0][0].messages[1].content;
    expect(prompt).toContain('identity-7');
    expect(runtime.updateIdentityMemory).toHaveBeenCalledWith({
      id: 'identity-7',
      mergeStrategy: 'replace',
      set: {
        details: 'User clarified their Agent Signal ownership.',
        title: 'Maintains Agent Signal',
      },
    });
    expect(result).toMatchObject({
      status: 'applied',
      target: {
        id: 'identity-7',
        memoryId: 'mem_9',
        memoryLayer: LayersEnum.Identity,
        type: 'memory',
      },
    });
  });

  it('falls back to params.id when the write output omits the entity id', async () => {
    getAllIdentitiesWithMemoryMock.mockResolvedValue([
      { identity: { id: 'identity-3' }, memory: { title: 'Existing identity title' } },
    ]);
    const runtime = buildRuntime();
    runtime.removeIdentityMemory.mockResolvedValue({
      content: 'Identity memory removed.',
      state: {},
      success: true,
    });
    memoryRuntimeFactoryMock.mockResolvedValue(runtime);
    generateObjectMock.mockResolvedValue({
      action: 'removeIdentityMemory',
      params: { id: 'identity-3' },
    });

    const result = await runMemoryActionAgent(baseInput, options);

    expect(result).toMatchObject({
      status: 'applied',
      target: {
        id: 'identity-3',
        memoryLayer: LayersEnum.Identity,
        title: 'Existing identity title',
        type: 'memory',
      },
    });
  });

  it('returns failed when the memory runtime rejects the write', async () => {
    const runtime = buildRuntime();
    runtime.addContextMemory.mockResolvedValue({
      content: 'Validation failed: missing context.',
      success: false,
    });
    memoryRuntimeFactoryMock.mockResolvedValue(runtime);
    generateObjectMock.mockResolvedValue({
      action: 'addContextMemory',
      params: { title: 'x' },
    });

    const result = await runMemoryActionAgent(baseInput, options, {
      marker: { kind: 'memory', sourceId: 'source_1' },
    });

    expect(result).toEqual({ detail: 'Validation failed: missing context.', status: 'failed' });
    expect(persistAgentSignalReceiptsMock).not.toHaveBeenCalled();
  });

  it('propagates model-runtime failures to the caller', async () => {
    const runtime = buildRuntime();
    memoryRuntimeFactoryMock.mockResolvedValue(runtime);
    generateObjectMock.mockRejectedValue(new Error('model unavailable'));

    await expect(runMemoryActionAgent(baseInput, options)).rejects.toThrow('model unavailable');
  });
});
