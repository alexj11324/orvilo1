import { renderHook } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { useCreateHeteroAgent } from './useCreateHeteroAgent';

const mocks = vi.hoisted(() => ({
  createAgent: vi.fn().mockResolvedValue({ agentId: 'new-agent' }),
  deviceId: undefined as string | undefined,
  navigate: vi.fn(),
  refreshAgentList: vi.fn(),
}));
vi.mock('@orvilo/const', () => ({ isDesktop: true }));
vi.mock('@/features/Workspace/useWorkspaceAwareNavigate', () => ({
  useWorkspaceAwareNavigate: () => mocks.navigate,
}));
vi.mock('@/services/electron/gatewayConnection', () => ({
  gatewayConnectionService: { getDeviceInfo: async () => undefined },
}));
vi.mock('@/store/agent', () => ({
  useAgentStore: (select: any) => select({ createAgent: mocks.createAgent }),
}));
vi.mock('@/store/electron', () => ({
  useElectronStore: (select: any) => select({ gatewayDeviceInfo: { deviceId: mocks.deviceId } }),
}));
vi.mock('@/store/home', () => ({
  useHomeStore: (select: any) => select({ refreshAgentList: mocks.refreshAgentList }),
}));
const definition = { defaultCommand: 'codex', title: 'Codex', type: 'codex' } as never;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.deviceId = undefined;
});
it('rejects a detected Agent without a saved device', async () => {
  const { result } = renderHook(useCreateHeteroAgent);
  await expect(result.current(definition)).rejects.toThrow('FIRST_AGENT_DEVICE_REQUIRED');
  expect(mocks.createAgent).not.toHaveBeenCalled();
});
it('persists the host and default model for a detected Agent', async () => {
  mocks.deviceId = 'device-a';
  const { result } = renderHook(useCreateHeteroAgent);
  await result.current(definition);
  expect(mocks.createAgent).toHaveBeenCalledWith(
    expect.objectContaining({
      config: expect.objectContaining({
        model: 'default',
        agencyConfig: expect.objectContaining({
          boundDeviceId: 'device-a',
          heterogeneousProvider: expect.objectContaining({ model: 'default' }),
        }),
      }),
    }),
  );
});
