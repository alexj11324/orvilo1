// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as ModelRuntimeModule from '@/server/modules/ModelRuntime';

import { AiGenerationService } from './index';

const mocks = vi.hoisted(() => ({
  runAcpJudgment: vi.fn(),
}));

vi.mock('./judgment', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  runAcpJudgment: mocks.runAcpJudgment,
}));

describe('AiGenerationService.generateObject', () => {
  const generateObject = vi.fn();
  const initSpy = vi.spyOn(ModelRuntimeModule, 'initModelRuntimeFromDeploymentConfig');

  beforeEach(() => {
    generateObject.mockReset();
    initSpy.mockReset();
    initSpy.mockResolvedValue({ generateObject } as never);
    mocks.runAcpJudgment.mockReset();
    mocks.runAcpJudgment.mockResolvedValue({ data: { verdict: 'passed' }, run: {} });
  });

  describe('kind: "basic" — enumerated non-agent exceptions', () => {
    const basicOptions = { caller: 'asr', kind: 'basic' } as const;

    it('initialises the runtime from deployment config with the caller-supplied provider', async () => {
      generateObject.mockResolvedValue({ ok: true });
      const ai = new AiGenerationService({} as never, 'user-1');
      await ai.generateObject(
        { messages: [{ content: 'hi', role: 'user' }], model: 'gpt-4o', provider: 'openai' },
        basicOptions,
      );
      expect(initSpy).toHaveBeenCalledWith('user-1', 'openai', undefined);
    });

    it('forwards messages / model / schema / tools / thinking verbatim to the runtime', async () => {
      generateObject.mockResolvedValue({ name: 'Atlas' });
      const schema = {
        name: 'Person',
        schema: {
          properties: { name: { type: 'string' } },
          required: ['name'],
          type: 'object' as const,
        },
      };

      const ai = new AiGenerationService({} as never, 'user-1');
      await ai.generateObject(
        {
          messages: [{ content: 'pick a name', role: 'user' }],
          model: 'gpt-4o',
          provider: 'openai',
          schema,
          thinking: { type: 'disabled' },
        },
        basicOptions,
      );

      const [payload] = generateObject.mock.calls[0];
      expect(payload).toEqual({
        messages: [{ content: 'pick a name', role: 'user' }],
        model: 'gpt-4o',
        schema,
        thinking: { type: 'disabled' },
        tools: undefined,
      });
    });

    it('forwards both options.metadata and options.tracing through to ModelRuntime.generateObject', async () => {
      generateObject.mockResolvedValue({});
      const ai = new AiGenerationService({} as never, 'user-1');
      await ai.generateObject(
        { messages: [], model: 'gpt-4o', provider: 'openai' },
        {
          ...basicOptions,
          metadata: { trigger: 'chat' },
          tracing: { promptVersion: 'v1.0', scenario: 'input_completion' },
        },
      );
      const [, options] = generateObject.mock.calls[0];
      expect(options).toMatchObject({
        metadata: { trigger: 'chat' },
        tracing: { promptVersion: 'v1.0', scenario: 'input_completion' },
      });
    });

    it('rejects a caller outside the enumerated exception list', async () => {
      const ai = new AiGenerationService({} as never, 'user-1');
      await expect(
        ai.generateObject(
          { messages: [], model: 'gpt-4o', provider: 'openai' },
          { caller: 'planning' as never, kind: 'basic' },
        ),
      ).rejects.toThrow(/not an enumerated basic-generation caller/);
      expect(initSpy).not.toHaveBeenCalled();
    });
  });

  describe('kind: "judgment" — ACP-authorized runs', () => {
    const judgmentOptions = {
      judgment: { binding: { agentId: 'agent-1' }, purpose: 'verify.judge' },
      kind: 'judgment',
    } as const;

    it('routes through runAcpJudgment and never initializes deployment config', async () => {
      const ai = new AiGenerationService({} as never, 'user-1', 'ws-1');
      const result = await ai.generateObject<{ verdict: string }>(
        {
          messages: [{ content: 'judge', role: 'user' }],
          model: 'gpt-4o',
          provider: 'openai',
        },
        judgmentOptions,
      );

      expect(result.verdict).toBe('passed');
      expect(initSpy).not.toHaveBeenCalled();
      expect(mocks.runAcpJudgment).toHaveBeenCalledTimes(1);

      const [, userId, params] = mocks.runAcpJudgment.mock.calls[0];
      expect(userId).toBe('user-1');
      expect(params).toMatchObject({
        input: { messages: [{ content: 'judge', role: 'user' }] },
        judgment: {
          binding: { agentId: 'agent-1' },
          model: 'gpt-4o',
          provider: 'openai',
          purpose: 'verify.judge',
        },
        workspaceId: 'ws-1',
      });
    });

    it('rejects tools on the judgment path instead of silently downgrading', async () => {
      const ai = new AiGenerationService({} as never, 'user-1');
      await expect(
        ai.generateObject(
          {
            messages: [],
            model: 'gpt-4o',
            provider: 'openai',
            tools: [
              {
                function: { name: 'x', parameters: {} },
                type: 'function',
              } as never,
            ],
          },
          judgmentOptions,
        ),
      ).rejects.toThrow(/tool-free/);
      expect(mocks.runAcpJudgment).not.toHaveBeenCalled();
      expect(initSpy).not.toHaveBeenCalled();
    });
  });
});
