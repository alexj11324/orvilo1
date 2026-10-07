import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  matchDeviceRuntimeInstallation,
  verifyDeviceRuntimeInstallation,
} from './installedRuntimeEvidence';

const { executeToolCall, persist } = vi.hoisted(() => ({
  executeToolCall: vi.fn(),
  persist: vi.fn(),
}));
vi.mock('./index', () => ({ deviceGateway: { executeToolCall } }));
vi.mock('@/database/models/device', () => ({
  DeviceModel: class {
    updateRuntimeInstallationEvidence = persist;
  },
}));
const owner = { deviceId: 'device-1', userId: 'user-1', workspaceId: 'workspace-1' };
const observed = { available: true, command: 'codex', observedAt: '2026-10-01T00:00:00Z' };

beforeEach(() => {
  vi.clearAllMocks();
  persist.mockResolvedValue(undefined);
});

describe('installed runtime evidence', () => {
  it('matches the exact runtime command and keeps offline known installation evidence', async () => {
    const snapshot = { installedRuntimes: { codex: observed } };
    expect(matchDeviceRuntimeInstallation(snapshot, { agentType: 'codex' })).toBe(true);
    expect(matchDeviceRuntimeInstallation(snapshot, { agentType: 'claude-code' })).toBe('unknown');
    expect(
      matchDeviceRuntimeInstallation(snapshot, { agentType: 'codex', command: '/custom/codex' }),
    ).toBe('unknown');
    expect(
      await verifyDeviceRuntimeInstallation({
        db: {} as never,
        owner,
        online: false,
        snapshot,
        requirement: { agentType: 'codex' },
      }),
    ).toMatchObject({ installed: true });
    expect(executeToolCall).not.toHaveBeenCalled();
  });

  it('does not certify a configured custom command from a default-command scan', async () => {
    const result = await verifyDeviceRuntimeInstallation({
      db: {} as never,
      owner,
      online: true,
      snapshot: { installedRuntimes: { codex: observed } },
      requirement: { agentType: 'codex', command: '/custom/codex' },
    });
    expect(result.installed).toBe('unknown');
    expect(result.error).toBeTruthy();
    expect(executeToolCall).not.toHaveBeenCalled();
  });

  it('persists a successful host scan with its actual observation time', async () => {
    executeToolCall.mockResolvedValue({
      success: true,
      content: JSON.stringify({
        agents: {
          'codex': { available: true, version: '1.2' },
          'claude-code': { available: false },
        },
      }),
    });
    const result = await verifyDeviceRuntimeInstallation({
      db: {} as never,
      owner,
      online: true,
      requirement: { agentType: 'codex' },
    });
    expect(result).toMatchObject({ installed: true });
    expect(persist.mock.calls[0][1]).toMatchObject({
      'codex': {
        available: true,
        command: 'codex',
        observedAt: expect.any(String),
        version: '1.2',
      },
      'claude-code': { available: false, command: 'claude', observedAt: expect.any(String) },
    });
    expect(Number.isNaN(Date.parse(persist.mock.calls[0][1].codex.observedAt))).toBe(false);
  });

  it.each(['tool-error', 'invalid-json', 'invalid-map', 'missing-runtime'])(
    'does not invent installation after %s',
    async (failure) => {
      const content =
        failure === 'invalid-json'
          ? '{'
          : JSON.stringify({
              agents: failure === 'invalid-map' ? { codex: { available: 'yes' } } : {},
            });
      executeToolCall.mockResolvedValue({
        success: failure !== 'tool-error',
        content,
        error: 'Offline',
      });
      const result = await verifyDeviceRuntimeInstallation({
        db: {} as never,
        owner,
        online: true,
        requirement: { agentType: 'codex' },
      });
      expect(result.installed).toBe('unknown');
      expect(result.error).toBeTruthy();
      if (failure !== 'missing-runtime') expect(persist).not.toHaveBeenCalled();
    },
  );

  it('preserves known facts after a failed live scan, while reporting the failure', async () => {
    executeToolCall.mockResolvedValue({ success: false, error: 'Device disconnected' });
    expect(
      await verifyDeviceRuntimeInstallation({
        db: {} as never,
        owner,
        online: true,
        snapshot: { installedRuntimes: { codex: observed } },
        requirement: { agentType: 'codex' },
      }),
    ).toMatchObject({ installed: true, error: 'Device disconnected' });
    expect(persist).not.toHaveBeenCalled();
  });

  it('uses the existing Prime installation-only verdict independently of readiness', async () => {
    executeToolCall.mockResolvedValue({
      success: true,
      content: JSON.stringify({
        installed: true,
        executor: 'prime',
        checkedAt: new Date().toISOString(),
        authenticated: 'unknown',
        repositoryAccessible: false,
        requiredToolsSupported: 'unknown',
        unattended: 'unknown',
      }),
    });
    expect(
      await verifyDeviceRuntimeInstallation({
        db: {} as never,
        owner,
        online: true,
        requirement: { agentType: 'orvilo' },
      }),
    ).toMatchObject({ installed: true });
    expect(executeToolCall.mock.calls[0][1].apiName).toBe('checkAutomationReadiness');
    expect(persist.mock.calls[0][1].prime.available).toBe(true);
  });
});
