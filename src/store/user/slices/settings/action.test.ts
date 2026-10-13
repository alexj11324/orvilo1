import { DEFAULT_SETTINGS } from '@orvilo/config';
import { act, renderHook } from '@testing-library/react';
import type { PartialDeep } from 'type-fest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { userService } from '@/services/user';
import { useUserStore } from '@/store/user';
import type { OrviloAgentSettings } from '@/types/session';
import type { UserSettings } from '@/types/user/settings';
import { merge } from '@/utils/merge';

// Mock userService
vi.mock('@/services/user', () => ({
  userService: {
    updateToolIntervention: vi.fn(),
    updateUserSettings: vi.fn(),
    resetUserSettings: vi.fn(),
  },
}));

describe('SettingsAction', () => {
  describe('importAppSettings', () => {
    it('should import app settings', async () => {
      const { result } = renderHook(() => useUserStore());
      const newSettings: UserSettings = merge(DEFAULT_SETTINGS, {
        general: { themeMode: 'dark' },
      });

      // Mock the internal setSettings function call
      const setSettingsSpy = vi.spyOn(result.current, 'setSettings');

      // Perform the action
      await act(async () => {
        await result.current.importAppSettings(newSettings);
      });

      // Assert that setSettings was called with the correct settings
      expect(setSettingsSpy).toHaveBeenCalledWith(newSettings);

      // Assert that the state has been updated
      expect(userService.updateUserSettings).toHaveBeenCalledWith(
        { general: { themeMode: 'dark' } },
        expect.any(AbortSignal),
      );

      // Restore the spy
      setSettingsSpy.mockRestore();
    });
  });

  describe('resetSettings', () => {
    it('should reset settings to default', async () => {
      const { result } = renderHook(() => useUserStore());

      // Perform the action
      await act(async () => {
        await result.current.resetSettings();
      });

      // Assert that resetUserSettings was called
      expect(userService.resetUserSettings).toHaveBeenCalled();

      // Assert that the state has been updated to default settings
      expect(result.current.settings).toEqual({});
    });
  });

  describe('setSettings', () => {
    it('should set partial settings', async () => {
      const { result } = renderHook(() => useUserStore());
      const partialSettings: PartialDeep<UserSettings> = { general: { fontSize: 12 } };

      // Perform the action
      await act(async () => {
        await result.current.setSettings(partialSettings);
      });

      // Assert that updateUserSettings was called with the correct settings
      expect(userService.updateUserSettings).toHaveBeenCalledWith(
        partialSettings,
        expect.any(AbortSignal),
      );
    });

    it('should include field in diffs when user resets it to default value', async () => {
      const { result } = renderHook(() => useUserStore());

      // First, set memory.enabled to false (non-default value)
      await act(async () => {
        await result.current.setSettings({ memory: { enabled: false } });
      });

      expect(userService.updateUserSettings).toHaveBeenLastCalledWith(
        expect.objectContaining({ memory: { enabled: false } }),
        expect.any(AbortSignal),
      );

      // Then, reset memory.enabled back to true (default value)
      // This should still include memory in the diffs to override the previously saved value
      await act(async () => {
        await result.current.setSettings({ memory: { enabled: true } });
      });

      expect(userService.updateUserSettings).toHaveBeenLastCalledWith(
        expect.objectContaining({ memory: { enabled: true } }),
        expect.any(AbortSignal),
      );
    });

    it('should only send the columns touched by this call (multi-tab clobber regression)', async () => {
      const { result } = renderHook(() => useUserStore());

      // Simulate a tab whose in-memory settings hold a stale `tool` column
      // (e.g. approvalMode was changed to auto-run from another tab afterwards)
      act(() => {
        useUserStore.setState({
          settings: { tool: { humanIntervention: { approvalMode: 'manual' } } } as any,
        });
      });

      // An unrelated write (like the hourly market token refresh) must not
      // carry the stale `tool` column and revert other tabs' changes
      await act(async () => {
        await result.current.setSettings({ general: { fontSize: 16 } });
      });

      const payload = vi.mocked(userService.updateUserSettings).mock.lastCall?.[0];
      expect(payload).toEqual({ general: { fontSize: 16 } });
      expect(payload).not.toHaveProperty('tool');
    });

    it('should resend a column whose write was aborted by a later call', async () => {
      const { result } = renderHook(() => useUserStore());

      // First write (e.g. the market token refresh) never reaches the server:
      // it rejects when the next call's internal_createSignal aborts it.
      vi.mocked(userService.updateUserSettings).mockImplementationOnce(
        (_value, signal) =>
          new Promise((_resolve, reject) => {
            signal?.addEventListener('abort', () => reject(new Error('aborted')));
          }),
      );

      const first = result.current
        .setSettings({ market: { accessToken: 'tok-1' } as any })
        .catch(() => {});

      await act(async () => {
        await result.current.setSettings({ general: { fontSize: 17 } });
        await first;
      });

      // The aborted `market` column must ride along on the second payload —
      // otherwise the token refresh would silently never persist.
      const payload = vi.mocked(userService.updateUserSettings).mock.lastCall?.[0] as any;
      expect(payload.general).toEqual(expect.objectContaining({ fontSize: 17 }));
      expect(payload.market).toEqual(expect.objectContaining({ accessToken: 'tok-1' }));
    });

    it('should keep legacy scalar system agent fields unchanged', async () => {
      const { result } = renderHook(() => useUserStore());
      const settingsWithLegacySystemAgent = {
        systemAgent: {
          enableAutoReply: true,
        },
      } as PartialDeep<UserSettings>;

      await act(async () => {
        await result.current.setSettings(settingsWithLegacySystemAgent);
      });

      expect(userService.updateUserSettings).toHaveBeenLastCalledWith(
        settingsWithLegacySystemAgent,
        expect.any(AbortSignal),
      );
    });
  });

  describe('updateHumanIntervention', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should write through the server-side merge endpoint instead of setSettings', async () => {
      const { result } = renderHook(() => useUserStore());

      await act(async () => {
        await result.current.updateHumanIntervention({ approvalMode: 'auto-run' });
      });

      expect(userService.updateToolIntervention).toHaveBeenCalledWith({
        approvalMode: 'auto-run',
      });
      // Must NOT go through the whole-settings diff channel: that would replace
      // the full `tool` column with this tab's possibly-stale snapshot
      expect(userService.updateUserSettings).not.toHaveBeenCalled();

      // Optimistic local update
      expect(result.current.settings.tool?.humanIntervention?.approvalMode).toBe('auto-run');
    });
  });

  describe('addToolToAllowList', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should append via the server-side merge endpoint and update local state', async () => {
      const { result } = renderHook(() => useUserStore());

      await act(async () => {
        await result.current.addToolToAllowList('bash/bash');
      });

      expect(userService.updateToolIntervention).toHaveBeenCalledWith({
        appendAllowList: ['bash/bash'],
      });
      expect(userService.updateUserSettings).not.toHaveBeenCalled();
      expect(result.current.settings.tool?.humanIntervention?.allowList).toEqual(['bash/bash']);
    });

    it('should skip when the tool is already in the allow list', async () => {
      const { result } = renderHook(() => useUserStore());

      act(() => {
        useUserStore.setState({
          settings: { tool: { humanIntervention: { allowList: ['bash/bash'] } } } as any,
        });
      });

      await act(async () => {
        await result.current.addToolToAllowList('bash/bash');
      });

      expect(userService.updateToolIntervention).not.toHaveBeenCalled();
    });
  });

  describe('updateDefaultAgent', () => {
    it('should update default agent settings', async () => {
      const { result } = renderHook(() => useUserStore());
      const updatedAgent: Partial<OrviloAgentSettings> = {
        meta: { title: 'docs' },
      };

      // Perform the action
      await act(async () => {
        await result.current.updateDefaultAgent(updatedAgent);
      });

      // Assert that updateUserSettings was called with the merged agent settings
      expect(userService.updateUserSettings).toHaveBeenCalledWith(
        { defaultAgent: updatedAgent },
        expect.any(AbortSignal),
      );
    });

    it('should persist default agent model and provider together', async () => {
      const { result } = renderHook(() => useUserStore());

      await act(async () => {
        await result.current.updateDefaultAgent({
          config: { model: 'claude-opus-4-6' },
        });
      });

      expect(userService.updateUserSettings).toHaveBeenLastCalledWith(
        {
          defaultAgent: {
            config: {
              model: 'claude-opus-4-6',
              provider: DEFAULT_SETTINGS.defaultAgent.config.provider,
            },
          },
        },
        expect.any(AbortSignal),
      );
    });
  });

  describe('updateSystemAgent', () => {
    it('should set partial settings', async () => {
      const { result } = renderHook(() => useUserStore());
      const systemAgentSettings: PartialDeep<UserSettings> = {
        systemAgent: {
          orchestrationWorkflow: {
            model: 'testmodel',
            provider: 'provider',
          },
        },
      };

      // Perform the action
      await act(async () => {
        await result.current.updateSystemAgent('goal', {
          provider: 'provider',
          model: 'testmodel',
        });
      });

      // Assert that updateUserSettings was called with the correct settings
      expect(userService.updateUserSettings).toHaveBeenCalledWith(
        systemAgentSettings,
        expect.any(AbortSignal),
      );
    });

    it('should persist system agent model and provider together when provider matches default', async () => {
      const { result } = renderHook(() => useUserStore());
      const model = 'ag/gemini-3.1-pro-high';
      const provider = DEFAULT_SETTINGS.systemAgent.orchestrationWorkflow.provider;

      await act(async () => {
        await result.current.updateSystemAgent('goal', { model, provider });
      });

      expect(userService.updateUserSettings).toHaveBeenLastCalledWith(
        {
          systemAgent: {
            orchestrationWorkflow: {
              model,
              provider,
            },
          },
        },
        expect.any(AbortSignal),
      );
    });
  });

  describe('pending settings retry transport', () => {
    const refreshUserState = useUserStore.getState().refreshUserState;
    const settingsUpdateResult: Awaited<ReturnType<typeof userService.updateUserSettings>> = {
      command: 'UPDATE',
      fields: [],
      oid: 0,
      rowCount: 1,
      rows: [],
    };
    const deferred = () => {
      let resolve!: () => void;
      let reject!: (error: Error) => void;
      const promise = new Promise<typeof settingsUpdateResult>((yes, no) => {
        resolve = () => yes(settingsUpdateResult);
        reject = no;
      });
      return { promise, reject, resolve };
    };
    beforeEach(() => {
      vi.mocked(userService.updateUserSettings).mockReset().mockResolvedValue(settingsUpdateResult);
      useUserStore.setState({
        settings: {},
        refreshUserState: vi.fn().mockResolvedValue(undefined),
      });
    });
    afterEach(() => {
      useUserStore.setState({ refreshUserState });
    });

    it('retains the unchanged-settings no-op when no write is pending', async () => {
      useUserStore.setState({ settings: { general: { fontSize: 18 } } });
      await useUserStore.getState().setSettings({ general: { fontSize: 18 } });
      expect(userService.updateUserSettings).not.toHaveBeenCalled();
      expect(useUserStore.getState().refreshUserState).not.toHaveBeenCalled();
    });

    it('retries the exact default model/provider payload after a real transport rejection', async () => {
      const failure = new Error('offline');
      vi.mocked(userService.updateUserSettings).mockRejectedValueOnce(failure);
      const pair = { model: 'retry-default-model', provider: 'retry-provider' };
      await expect(useUserStore.getState().updateDefaultAgent({ config: pair })).rejects.toBe(
        failure,
      );
      const failedPayload = vi.mocked(userService.updateUserSettings).mock.calls[0][0];
      expect(useUserStore.getState().settings.defaultAgent?.config).toMatchObject(pair);
      expect(useUserStore.getState().refreshUserState).not.toHaveBeenCalled();
      await useUserStore.getState().updateDefaultAgent({ config: pair });
      expect(userService.updateUserSettings).toHaveBeenCalledTimes(2);
      const retry = vi.mocked(userService.updateUserSettings).mock.calls[1];
      expect(retry[0]).toEqual(failedPayload);
      expect(retry[0]).toHaveProperty('defaultAgent.config', pair);
      expect(retry[1]).not.toBe(vi.mocked(userService.updateUserSettings).mock.calls[0][1]);
      expect(useUserStore.getState().refreshUserState).toHaveBeenCalledOnce();
      // Once confirmed, another identical call remains an ordinary no-op.
      await useUserStore.getState().updateDefaultAgent({ config: pair });
      expect(userService.updateUserSettings).toHaveBeenCalledTimes(2);
    });

    it('retains explicit default model/provider resets beside a non-default sibling on retry', async () => {
      useUserStore.setState({
        settings: {
          defaultAgent: {
            config: {
              model: 'other-model',
              provider: 'other-provider',
              params: { temperature: 0.123 },
            },
          },
        },
      });
      const pair = {
        model: DEFAULT_SETTINGS.defaultAgent.config.model,
        provider: DEFAULT_SETTINGS.defaultAgent.config.provider,
      };
      vi.mocked(userService.updateUserSettings).mockRejectedValueOnce(new Error('offline'));
      await expect(useUserStore.getState().updateDefaultAgent({ config: pair })).rejects.toThrow(
        'offline',
      );
      const failedPayload = vi.mocked(userService.updateUserSettings).mock.calls[0][0];
      expect(failedPayload).toHaveProperty('defaultAgent.config', {
        ...pair,
        params: { temperature: 0.123 },
      });
      await useUserStore.getState().updateDefaultAgent({ config: pair });
      expect(userService.updateUserSettings).toHaveBeenCalledTimes(2);
      expect(vi.mocked(userService.updateUserSettings).mock.calls[1][0]).toEqual(failedPayload);
    });

    it('retries a system model without dropping sibling metadata or unrelated local columns', async () => {
      useUserStore.setState({
        settings: {
          general: { fontSize: 18 },
          systemAgent: { goal: { customPrompt: 'keep', enabled: false } },
        },
      });
      const pair = { model: 'retry-goal-model', provider: 'retry-provider' };
      vi.mocked(userService.updateUserSettings).mockRejectedValueOnce(new Error('offline'));
      await expect(useUserStore.getState().updateSystemAgent('goal', pair)).rejects.toThrow(
        'offline',
      );
      const failedPayload = vi.mocked(userService.updateUserSettings).mock.calls[0][0];
      await useUserStore.getState().updateSystemAgent('goal', pair);
      expect(userService.updateUserSettings).toHaveBeenCalledTimes(2);
      expect(vi.mocked(userService.updateUserSettings).mock.calls[1][0]).toEqual(failedPayload);
      expect(failedPayload).toHaveProperty('systemAgent.goal', {
        ...pair,
        customPrompt: 'keep',
        enabled: false,
      });
      expect(failedPayload).not.toHaveProperty('general');
      expect(useUserStore.getState().settings.general?.fontSize).toBe(18);
    });

    it('does not let an aborted older success clear newer pending columns or refresh over them', async () => {
      const older = deferred();
      const newer = deferred();
      vi.mocked(userService.updateUserSettings)
        .mockImplementationOnce(() => older.promise)
        .mockImplementationOnce(() => newer.promise);
      const a = useUserStore.getState().updateDefaultAgent({
        config: { model: 'pending-default', provider: 'retry-provider' },
      });
      const pair = { model: 'pending-goal', provider: 'retry-provider' };
      const b = useUserStore.getState().updateSystemAgent('goal', pair);
      const bRejected = expect(b).rejects.toThrow('newest failure');
      const calls = vi.mocked(userService.updateUserSettings).mock.calls;
      expect(calls[0][1]?.aborted).toBe(true);
      older.resolve();
      await a;
      expect(useUserStore.getState().refreshUserState).not.toHaveBeenCalled();
      newer.reject(new Error('newest failure'));
      await bRejected;
      await useUserStore.getState().updateSystemAgent('goal', pair);
      expect(userService.updateUserSettings).toHaveBeenCalledTimes(3);
      expect(vi.mocked(userService.updateUserSettings).mock.calls[2][0]).toEqual(calls[1][0]);
      expect(calls[1][0]).toHaveProperty('defaultAgent.config.model', 'pending-default');
      expect(calls[1][0]).toHaveProperty('systemAgent.goal.model', 'pending-goal');
      expect(useUserStore.getState().refreshUserState).toHaveBeenCalledOnce();
    });

    it('keeps a newer pending edit when the older same-column write rejects', async () => {
      const older = deferred();
      const newer = deferred();
      vi.mocked(userService.updateUserSettings)
        .mockImplementationOnce(() => older.promise)
        .mockImplementationOnce(() => newer.promise);
      const a = useUserStore
        .getState()
        .updateSystemAgent('goal', { model: 'older', provider: 'retry-provider' });
      const aRejected = expect(a).rejects.toThrow('older abort');
      const pair = { model: 'newer', provider: 'retry-provider' };
      const b = useUserStore.getState().updateSystemAgent('goal', pair);
      older.reject(new Error('older abort'));
      await aRejected;
      expect(useUserStore.getState().settings.systemAgent?.goal).toMatchObject(pair);
      expect(useUserStore.getState().refreshUserState).not.toHaveBeenCalled();
      newer.resolve();
      await b;
      expect(useUserStore.getState().refreshUserState).toHaveBeenCalledOnce();
      await useUserStore.getState().updateSystemAgent('goal', pair);
      expect(userService.updateUserSettings).toHaveBeenCalledTimes(2);
    });
  });
});
