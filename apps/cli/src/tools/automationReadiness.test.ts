import { describe, expect, it, vi } from 'vitest';

import { executeToolCall } from './index';

// Isolate unrelated local tool runtimes while exercising the real readiness
// validation, host probe and gateway serialization through executeToolCall.
vi.mock('../utils/logger', () => ({ log: { error: vi.fn() } }));
vi.mock('./checkPlatformCapability', () => ({ checkPlatformCapability: vi.fn() }));
vi.mock('./getAgentProfile', () => ({ getAgentProfile: vi.fn() }));
vi.mock('./heteroTask', () => ({ cancelHeteroTask: vi.fn(), runHeteroTask: vi.fn() }));
vi.mock('./isolatedWorker', () => ({
  executeToolCallInWorker: vi.fn(),
  shouldRunInWorker: () => false,
}));
vi.mock('./localSystemRuntime', () => ({ runLocalSystemTool: async () => null }));
vi.mock('./scanHeterogeneousAgents', () => ({ scanHeterogeneousAgents: vi.fn() }));

describe('automation readiness gateway contract', () => {
  it('serializes host evidence through the actual CLI handler without a run', async () => {
    const result = await executeToolCall(
      'checkAutomationReadiness',
      JSON.stringify({ agentType: 'native', requiredTools: ['writeIssue'] }),
      5000,
    );
    expect(result.success).toBe(true);
    expect(JSON.parse(result.content)).toMatchObject({
      authenticated: 'unknown',
      executor: 'prime',
      repositoryAccessible: true,
      requiredToolsSupported: 'unknown',
      unattended: false,
      blockers: ['EXECUTOR_UNSUPPORTED'],
    });
    expect(JSON.parse(result.content).checkedAt).toEqual(expect.any(String));
  });

  it('returns a failure envelope for invalid readiness requests', async () => {
    const result = await executeToolCall('checkAutomationReadiness', '{}');
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });
});
