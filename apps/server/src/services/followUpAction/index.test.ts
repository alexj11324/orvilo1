// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { notShareVisitorMessage } from '@/database/utils/shareVisitor';
import { AcpJudgmentBindingError } from '@/server/services/aiGeneration/judgment';

import { FollowUpActionService } from './index';

const TEST_USER = 'user-1';
const TEST_TOPIC = 'topic-1';
const FOUND_MSG = 'msg-real';
const MODEL_CONFIG = {
  model: 'scene-model',
  provider: 'scene-provider',
};

const mocks = vi.hoisted(() => ({
  generateObject: vi.fn(),
  topicFindById: vi.fn(),
}));

vi.mock('@/database/models/topic', () => ({
  TopicModel: vi.fn(function () {
    return { findById: mocks.topicFindById };
  }),
}));
vi.mock('@/server/services/aiGeneration', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  AiGenerationService: vi.fn(function () {
    return { generateObject: mocks.generateObject };
  }),
}));

describe('FollowUpActionService.extract', () => {
  let svc: FollowUpActionService;
  let dbMock: any;
  let queryFindFirstSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    queryFindFirstSpy = vi.fn();
    dbMock = {
      query: {
        messages: {
          findFirst: queryFindFirstSpy,
        },
      },
    };

    mocks.generateObject.mockReset();
    mocks.topicFindById.mockReset();
    mocks.topicFindById.mockResolvedValue({ agentId: 'topic-agent-1' });

    svc = new FollowUpActionService(dbMock, TEST_USER);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('binds the extraction judgment to the topic agent on every call', async () => {
    queryFindFirstSpy.mockResolvedValue({ id: FOUND_MSG, content: 'Choose a next step.' });
    mocks.generateObject.mockResolvedValue({ chips: [] });
    mocks.topicFindById.mockImplementation(async (id: string) => ({
      agentId: `agent-of-${id}`,
      id,
    }));

    for (const topicId of ['topic-1', 'topic-1', 'topic-2']) {
      expect(
        await svc.extract({
          modelConfig: { model: 'glm-5', provider: 'opencodecodingplan' },
          topicId,
        }),
      ).toEqual({ chips: [], messageId: FOUND_MSG });
    }

    expect(mocks.topicFindById.mock.calls.map((call) => call[0])).toEqual([
      'topic-1',
      'topic-1',
      'topic-2',
    ]);
    for (const [, options] of mocks.generateObject.mock.calls) {
      expect(options).toMatchObject({ kind: 'judgment' });
    }
    expect(
      mocks.generateObject.mock.calls.map(([, options]) => options.judgment.binding.agentId),
    ).toEqual(['agent-of-topic-1', 'agent-of-topic-1', 'agent-of-topic-2']);
  });

  it('surfaces a missing ACP binding instead of degrading', async () => {
    queryFindFirstSpy.mockResolvedValue({ id: FOUND_MSG, content: 'q?' });
    mocks.generateObject.mockRejectedValue(new AcpJudgmentBindingError('followUp.extract'));

    await expect(
      svc.extract({ modelConfig: MODEL_CONFIG, topicId: TEST_TOPIC }),
    ).rejects.toMatchObject({ code: 'ACP_JUDGMENT_NO_BINDING' });
  });

  it('excludes agent-share visitor messages from the assistant lookup', async () => {
    queryFindFirstSpy.mockResolvedValue(undefined);
    await svc.extract({ modelConfig: MODEL_CONFIG, topicId: TEST_TOPIC });

    const { where } = queryFindFirstSpy.mock.calls[0][0];
    const operators = {
      and: (...conditions: unknown[]) => conditions,
      eq: (column: unknown, value: unknown) => ({ column, op: 'eq', value }),
      isNotNull: (column: unknown) => ({ column, op: 'isNotNull' }),
      isNull: (column: unknown) => ({ column, op: 'isNull' }),
      ne: (column: unknown, value: unknown) => ({ column, op: 'ne', value }),
    };
    const conditions = where(
      {
        content: 'content',
        role: 'role',
        threadId: 'threadId',
        topicId: 'topicId',
        userId: 'userId',
        workspaceId: 'workspaceId',
      },
      operators,
    ) as unknown[];

    expect(conditions).toContainEqual(notShareVisitorMessage());
  });

  it('returns empty (with empty messageId) when no eligible assistant message found', async () => {
    queryFindFirstSpy.mockResolvedValue(undefined);
    const result = await svc.extract({ modelConfig: MODEL_CONFIG, topicId: TEST_TOPIC });
    expect(result).toEqual({ chips: [], messageId: '' });
    expect(mocks.generateObject).not.toHaveBeenCalled();
  });

  it('returns chips from a valid LLM JSON response, keyed by resolved message id', async () => {
    queryFindFirstSpy.mockResolvedValue({
      id: FOUND_MSG,
      content: 'What would you like to call me?',
    });
    mocks.generateObject.mockResolvedValue({
      chips: [
        { label: 'Lumi', message: 'Lumi' },
        { label: 'Atlas', message: 'Atlas' },
        { label: 'You pick one', message: 'You pick one for me' },
      ],
    });
    const result = await svc.extract({
      topicId: TEST_TOPIC,
      hint: { kind: 'onboarding', phase: 'agent_identity' },
      modelConfig: MODEL_CONFIG,
    });
    expect(result.messageId).toBe(FOUND_MSG);
    expect(result.chips).toHaveLength(3);
    expect(result.chips[0].label).toBe('Lumi');
  });

  it('uses the caller-provided scene model config for extraction', async () => {
    queryFindFirstSpy.mockResolvedValue({
      id: FOUND_MSG,
      content: 'What would you like to call me?',
    });
    mocks.generateObject.mockResolvedValue({ chips: [] });

    await svc.extract({
      topicId: TEST_TOPIC,
      modelConfig: {
        model: 'custom-scene-model',
        provider: 'custom-provider',
      },
    });

    expect(mocks.generateObject).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'custom-scene-model',
        provider: 'custom-provider',
      }),
      expect.objectContaining({
        judgment: expect.objectContaining({ purpose: 'followUp.extract' }),
        kind: 'judgment',
        metadata: expect.objectContaining({ topicId: TEST_TOPIC }),
        tracing: expect.objectContaining({
          promptVersion: 'v1.0',
          scenario: 'follow_up',
          schemaName: 'follow_up_suggestions',
          topicId: TEST_TOPIC,
        }),
      }),
    );
  });

  it('truncates more than 4 chips', async () => {
    queryFindFirstSpy.mockResolvedValue({ id: FOUND_MSG, content: 'choose' });
    mocks.generateObject.mockResolvedValue({
      chips: Array.from({ length: 6 }, (_, i) => ({ label: `c${i}`, message: `c${i}` })),
    });
    const result = await svc.extract({ modelConfig: MODEL_CONFIG, topicId: TEST_TOPIC });
    expect(result.chips).toHaveLength(4);
  });

  it('drops chips that exceed length limits but keeps the rest', async () => {
    queryFindFirstSpy.mockResolvedValue({ id: FOUND_MSG, content: 'choose' });
    mocks.generateObject.mockResolvedValue({
      chips: [
        { label: 'a'.repeat(50), message: 'too long label' },
        { label: 'ok', message: 'ok' },
      ],
    });
    const result = await svc.extract({ modelConfig: MODEL_CONFIG, topicId: TEST_TOPIC });
    expect(result.chips).toEqual([{ label: 'ok', message: 'ok' }]);
  });

  it('drops chips with empty label or message', async () => {
    queryFindFirstSpy.mockResolvedValue({ id: FOUND_MSG, content: 'choose' });
    mocks.generateObject.mockResolvedValue({
      chips: [
        { label: '', message: '' },
        { label: 'ok', message: 'ok' },
        { label: 'bad', message: '' },
      ],
    });
    const result = await svc.extract({ modelConfig: MODEL_CONFIG, topicId: TEST_TOPIC });
    expect(result.chips).toEqual([{ label: 'ok', message: 'ok' }]);
  });

  it('returns empty (with messageId) when the judgment run fails', async () => {
    queryFindFirstSpy.mockResolvedValue({ id: FOUND_MSG, content: 'q?' });
    mocks.generateObject.mockRejectedValue(new Error('boom'));
    const result = await svc.extract({ modelConfig: MODEL_CONFIG, topicId: TEST_TOPIC });
    expect(result).toEqual({ chips: [], messageId: FOUND_MSG });
  });

  it('returns empty (with messageId) when LLM response fails schema validation', async () => {
    queryFindFirstSpy.mockResolvedValue({ id: FOUND_MSG, content: 'q?' });
    mocks.generateObject.mockResolvedValue({ chips: 'not-an-array' });
    const result = await svc.extract({ modelConfig: MODEL_CONFIG, topicId: TEST_TOPIC });
    expect(result).toEqual({ chips: [], messageId: FOUND_MSG });
  });

  const captureWhereOps = () => {
    const arg = queryFindFirstSpy.mock.calls[0][0];
    const fakeTable = {
      content: { col: 'content' },
      createdAt: { col: 'createdAt' },
      id: { col: 'id' },
      role: { col: 'role' },
      threadId: { col: 'threadId' },
      topicId: { col: 'topicId' },
      userId: { col: 'userId' },
      workspaceId: { col: 'workspaceId' },
    };
    const ops = {
      and: (...parts: any[]) => ({ op: 'and', parts }),
      eq: (col: any, value: any) => ({ col, op: 'eq', value }),
      isNotNull: (col: any) => ({ col, op: 'isNotNull' }),
      isNull: (col: any) => ({ col, op: 'isNull' }),
      ne: (col: any, value: any) => ({ col, op: 'ne', value }),
    };
    const result = arg.where(fakeTable, ops);
    return { parts: result.parts as any[], table: fakeTable };
  };

  it('filters by threadId when provided (thread isolation)', async () => {
    queryFindFirstSpy.mockResolvedValue(undefined);
    await svc.extract({
      modelConfig: MODEL_CONFIG,
      threadId: 'thread-A',
      topicId: TEST_TOPIC,
    });
    const { parts, table } = captureWhereOps();
    expect(parts).toContainEqual({ col: table.threadId, op: 'eq', value: 'thread-A' });
    expect(parts.some((p) => p.op === 'isNull' && p.col === table.threadId)).toBe(false);
  });

  it('filters by isNull(threadId) when no threadId provided (main topic only)', async () => {
    queryFindFirstSpy.mockResolvedValue(undefined);
    await svc.extract({ modelConfig: MODEL_CONFIG, topicId: TEST_TOPIC });
    const { parts, table } = captureWhereOps();
    expect(parts).toContainEqual({ col: table.threadId, op: 'isNull' });
    expect(parts.some((p) => p.op === 'eq' && p.col === table.threadId)).toBe(false);
  });

  it('filters personal mode by userId and null workspaceId', async () => {
    queryFindFirstSpy.mockResolvedValue(undefined);
    await svc.extract({ modelConfig: MODEL_CONFIG, topicId: TEST_TOPIC });
    const { parts, table } = captureWhereOps();
    const ownership = parts.find((p) => p.op === 'and' && p.parts?.length === 2);
    expect(ownership.parts).toEqual([
      { col: table.userId, op: 'eq', value: TEST_USER },
      { col: table.workspaceId, op: 'isNull' },
    ]);
  });

  it('filters workspace mode by workspaceId and keeps the judgment on the same scope', async () => {
    svc = new FollowUpActionService(dbMock, TEST_USER, 'workspace-1');
    queryFindFirstSpy.mockResolvedValue({ id: FOUND_MSG, content: 'q?' });
    mocks.generateObject.mockResolvedValue({ chips: [] });

    await svc.extract({ modelConfig: MODEL_CONFIG, topicId: TEST_TOPIC });

    const { parts, table } = captureWhereOps();
    expect(parts).toContainEqual({ col: table.workspaceId, op: 'eq', value: 'workspace-1' });
    expect(mocks.generateObject).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ kind: 'judgment' }),
    );
  });

  it('appends onboarding addendum to system prompt when hint is onboarding', async () => {
    queryFindFirstSpy.mockResolvedValue({ id: FOUND_MSG, content: 'q?' });
    mocks.generateObject.mockResolvedValue({ chips: [] });
    await svc.extract({
      topicId: TEST_TOPIC,
      hint: { kind: 'onboarding', phase: 'discovery' },
      modelConfig: MODEL_CONFIG,
    });
    const passedMessages = mocks.generateObject.mock.calls[0][0].messages;
    const sysContent = passedMessages.find((m: any) => m.role === 'system').content;
    expect(sysContent).toContain('Phase: discovery');
    expect(sysContent).toContain('Phase tip:');
  });
});
