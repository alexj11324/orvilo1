import { DEFAULT_SETTINGS } from '@orvilo/config';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { useController } from 'react-hook-form';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  resolveEnableTargetProviderId,
  resolveStaleModelState,
} from '@/features/ModelSelect/resolveStaleModelState';
import { userService } from '@/services/user';
import { useUserStore } from '@/store/user';
import { settingsSelectors } from '@/store/user/selectors';
import { merge } from '@/utils/merge';

import {
  MEMORY_MODEL_ITEMS,
  SYSTEM_AGENT_MODEL_ITEMS,
  useModelAssignmentsForm,
} from './useModelAssignmentsForm';

// Exercise the actual RHF controllers, user store/actions and save lifecycle.
// Permission resources and the settings network service are the only boundaries.
const access = vi.hoisted(() => ({ allowed: true, reason: undefined as string | undefined }));
vi.mock('@/hooks/usePermission', () => ({ usePermission: () => access }));
vi.mock('@/services/user', () => ({
  userService: { updateUserSettings: vi.fn(), resetUserSettings: vi.fn() },
}));

const originalActions = {
  updateDefaultAgent: useUserStore.getState().updateDefaultAgent,
  updateSystemAgent: useUserStore.getState().updateSystemAgent,
  refreshUserState: useUserStore.getState().refreshUserState,
};
const rowKeys = [
  'expertise',
  'goal',
  'memoryAnalysisAgentConfig',
  'userMemoryPersonaWriter',
  'userMemoryEmbedding',
] as const;
const settingsUpdateResult: Awaited<ReturnType<typeof userService.updateUserSettings>> = {
  command: 'UPDATE',
  fields: [],
  oid: 0,
  rowCount: 1,
  rows: [],
};
const nextChoice = { model: 'family/fixture-next', provider: 'orvilo' };
const deferred = <Value>(value: Value) => {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<Value>((yes, no) => {
    resolve = () => yes(value);
    reject = no;
  });
  return { promise, reject, resolve };
};

// Bind the same nine real RHF fields as the view, without rendering a new component test.
const useFormFields = () => {
  const form = useModelAssignmentsForm();
  const { control, contextLimitRules: rules } = form;
  const fields = {
    defaultAgent: useController({ control, name: 'defaultAgent.config' }),
    expertise: useController({ control, name: 'systemAgent.expertise' }),
    goal: useController({ control, name: 'systemAgent.goal' }),
    memoryAnalysisAgentConfig: useController({
      control,
      name: 'systemAgent.memoryAnalysisAgentConfig',
    }),
    userMemoryPersonaWriter: useController({
      control,
      name: 'systemAgent.userMemoryPersonaWriter',
    }),
    userMemoryEmbedding: useController({ control, name: 'systemAgent.userMemoryEmbedding' }),
  };
  const limits = {
    memoryAnalysisAgentConfig: useController({
      control,
      name: 'systemAgent.memoryAnalysisAgentConfig.contextLimit',
      rules,
    }),
    userMemoryPersonaWriter: useController({
      control,
      name: 'systemAgent.userMemoryPersonaWriter.contextLimit',
      rules,
    }),
    userMemoryEmbedding: useController({
      control,
      name: 'systemAgent.userMemoryEmbedding.contextLimit',
      rules,
    }),
  };
  const limitErrors = {
    memoryAnalysisAgentConfig: limits.memoryAnalysisAgentConfig.fieldState.error,
    userMemoryEmbedding: limits.userMemoryEmbedding.fieldState.error,
    userMemoryPersonaWriter: limits.userMemoryPersonaWriter.fieldState.error,
  };
  return { ...form, fields, limitErrors, limits };
};
const mount = () => renderHook(useFormFields);
const disabledSelection = { model: 'fixture-disabled', provider: 'removed-provider' };
const resolveFallback = () => {
  const stale = resolveStaleModelState(disabledSelection, {
    builtinAiModelList: [
      {
        abilities: {},
        displayName: 'Fixture Disabled',
        enabled: false,
        id: 'fixture-disabled',
        providerId: 'orvilo',
        type: 'chat',
      },
    ],
    enabledList: [],
    modelType: 'chat',
  });
  expect(stale?.status).toBe('notEnabled');
  const provider = resolveEnableTargetProviderId(disabledSelection, {
    enabledAiProviders: [{ id: 'orvilo' }],
    enabledList: [],
    metaProviderId: stale?.meta?.providerId,
  });
  if (!provider) throw new Error('Missing fallback provider');
  return { model: disabledSelection.model, provider };
};

describe('useModelAssignmentsForm owned autosave', () => {
  beforeEach(() => {
    access.allowed = true;
    access.reason = undefined;
    vi.mocked(userService.updateUserSettings).mockReset().mockResolvedValue(settingsUpdateResult);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const defaultSettings = merge(DEFAULT_SETTINGS, {
      defaultAgent: { config: { model: 'fixture-current', provider: 'orvilo' } },
      systemAgent: Object.fromEntries(
        rowKeys.map((key, index) => [
          key,
          {
            contextLimit: 13 + index,
            model: key === 'userMemoryEmbedding' ? 'fixture-embedding' : 'fixture-current',
            provider: 'orvilo',
          },
        ]),
      ),
    });
    useUserStore.setState({
      ...originalActions,
      defaultSettings,
      isUserStateInit: true,
      isUserStateInitError: undefined,
      refreshUserState: vi.fn().mockResolvedValue(undefined),
      settings: {
        general: { fontSize: 18 },
        systemAgent: { expertise: { customPrompt: 'keep this prompt', enabled: false } },
        tool: { humanIntervention: { approvalMode: 'manual' } },
      },
    });
  });

  afterEach(() => {
    cleanup();
    useUserStore.setState(originalActions);
    vi.restoreAllMocks();
  });

  it('initializes the six existing model fields and only the three memory context limits', () => {
    const { result } = mount();
    expect(Object.keys(result.current.fields)).toEqual(['defaultAgent', ...rowKeys]);
    expect(SYSTEM_AGENT_MODEL_ITEMS.map(({ key }) => key)).toEqual(['expertise', 'goal']);
    expect(
      MEMORY_MODEL_ITEMS.filter(({ contextLimit }) => contextLimit).map(({ key }) => key),
    ).toEqual(Object.keys(result.current.limits));
    expect(result.current.fields.defaultAgent.field.value).toMatchObject({
      model: 'fixture-current',
      provider: 'orvilo',
    });
    expect(result.current.fields.expertise.field.value).toMatchObject({
      customPrompt: 'keep this prompt',
      enabled: false,
    });
  });

  it.each(['defaultAgent', ...rowKeys.filter((key) => key !== 'userMemoryEmbedding')] as const)(
    'autosaves the full model/provider pair through the real %s settings action',
    async (key) => {
      const { result } = mount();
      await act(async () => {
        const { field } = result.current.fields[key];
        if (key === 'defaultAgent')
          await result.current.changeDefaultAgentModel(nextChoice, field.onChange);
        else await result.current.changeSystemAgentModel(key, nextChoice, field.onChange);
      });
      const payload = vi.mocked(userService.updateUserSettings).mock.calls.at(-1)![0];
      const selected =
        key === 'defaultAgent' ? payload.defaultAgent?.config : payload.systemAgent?.[key];
      expect(selected).toMatchObject(nextChoice);
      expect(payload).not.toHaveProperty('general');
      expect(payload).not.toHaveProperty('tool');
      expect(settingsSelectors.currentSystemAgent(useUserStore.getState()).expertise).toMatchObject(
        { customPrompt: 'keep this prompt', enabled: false },
      );
      expect(result.current.saveStatus).toBe('saved');
      expect(result.current.savingGroup).toBe(
        key.startsWith('memory') || key === 'userMemoryPersonaWriter' ? 'memory' : 'assignments',
      );
    },
  );

  it('keeps the embedding model role and writes the original embedding path', async () => {
    const { result } = mount();
    expect(MEMORY_MODEL_ITEMS.find(({ key }) => key === 'userMemoryEmbedding')?.modelType).toBe(
      'embedding',
    );
    await act(async () =>
      result.current.changeSystemAgentModel(
        'userMemoryEmbedding',
        { model: 'fixture-embedding-next', provider: 'orvilo' },
        result.current.fields.userMemoryEmbedding.field.onChange,
      ),
    );
    const payload = vi.mocked(userService.updateUserSettings).mock.calls.at(-1)![0];
    expect(payload.systemAgent?.userMemoryEmbedding).toMatchObject({
      model: 'fixture-embedding-next',
      provider: 'orvilo',
    });
    expect(result.current.savingGroup).toBe('memory');
  });

  it.each(['memoryAnalysisAgentConfig', 'userMemoryPersonaWriter', 'userMemoryEmbedding'] as const)(
    'preserves numeric, clearing and subsequent increment autosave callbacks for %s',
    async (key) => {
      const action = vi.spyOn(useUserStore.getState(), 'updateSystemAgent');
      const { result } = mount();
      await act(async () =>
        result.current.changeContextLimit(key, 32, result.current.limits[key].field.onChange),
      );
      expect(settingsSelectors.currentSystemAgent(useUserStore.getState())[key].contextLimit).toBe(
        32,
      );
      expect(result.current.limits[key].field.value).toBe(32);
      await act(async () =>
        result.current.changeContextLimit(key, null, result.current.limits[key].field.onChange),
      );
      expect(action).toHaveBeenLastCalledWith(key, { contextLimit: undefined });
      expect(result.current.limits[key].field.value).toBeNull();
      // NumberField's empty value is null; the existing action/server contract never receives null.
      expect(
        vi.mocked(userService.updateUserSettings).mock.calls.at(-1)![0].systemAgent?.[key]
          ?.contextLimit,
      ).not.toBeNull();
      await act(async () =>
        result.current.changeContextLimit(key, 1, result.current.limits[key].field.onChange),
      );
      expect(settingsSelectors.currentSystemAgent(useUserStore.getState())[key].contextLimit).toBe(
        1,
      );
    },
  );

  it('blocks model, numeric and retry writes when permission is denied', async () => {
    access.allowed = false;
    access.reason = 'readonly fixture';
    const { result } = mount();
    expect(result.current.canManageServiceModel).toBe(false);
    expect(result.current.reason).toBe('readonly fixture');
    const before = result.current.fields.defaultAgent.field.value;
    await act(async () => {
      await result.current.changeDefaultAgentModel(
        nextChoice,
        result.current.fields.defaultAgent.field.onChange,
      );
      await result.current.changeSystemAgentModel(
        'goal',
        nextChoice,
        result.current.fields.goal.field.onChange,
      );
      await result.current.changeContextLimit(
        'memoryAnalysisAgentConfig',
        32,
        result.current.limits.memoryAnalysisAgentConfig.field.onChange,
      );
      await result.current.retrySave();
    });
    expect(userService.updateUserSettings).not.toHaveBeenCalled();
    expect(result.current.fields.defaultAgent.field.value).toEqual(before);
    expect(result.current.limits.memoryAnalysisAgentConfig.field.value).toBe(15);
  });

  it('keeps the latest group saved after an older request fails without rolling back its edits', async () => {
    const older = deferred(settingsUpdateResult);
    const newer = deferred(settingsUpdateResult);
    vi.mocked(userService.updateUserSettings)
      .mockImplementationOnce(() => older.promise)
      .mockImplementationOnce(() => newer.promise);
    const { result } = mount();
    act(() => {
      void result.current.changeDefaultAgentModel(
        nextChoice,
        result.current.fields.defaultAgent.field.onChange,
      );
      void result.current.changeContextLimit(
        'memoryAnalysisAgentConfig',
        40,
        result.current.limits.memoryAnalysisAgentConfig.field.onChange,
      );
    });
    await waitFor(() => expect(userService.updateUserSettings).toHaveBeenCalledTimes(2));
    const [first, second] = vi.mocked(userService.updateUserSettings).mock.calls;
    expect(first[1]?.aborted).toBe(true);
    expect(second[0]).toHaveProperty('defaultAgent.config.model', 'family/fixture-next');
    expect(second[0]).toHaveProperty('systemAgent.memoryAnalysisAgentConfig.contextLimit', 40);
    await act(async () => {
      newer.resolve();
      await newer.promise;
    });
    expect(result.current.saveStatus).toBe('saved');
    expect(result.current.savingGroup).toBe('memory');
    const savedAt = result.current.lastSavedAt;
    await act(async () => {
      older.reject(new Error('superseded abort'));
      await Promise.resolve();
    });
    expect(result.current.saveStatus).toBe('saved');
    expect(result.current.lastSavedAt).toBe(savedAt);
    expect(result.current.limits.memoryAnalysisAgentConfig.field.value).toBe(40);
    expect(settingsSelectors.defaultAgent(useUserStore.getState()).config.model).toBe(
      'family/fixture-next',
    );
  });

  it('retains a failed draft and retries the same action before accepting a server refresh', async () => {
    vi.mocked(userService.updateUserSettings).mockRejectedValueOnce(new Error('offline'));
    const { result } = mount();
    await act(async () =>
      result.current.changeSystemAgentModel(
        'goal',
        nextChoice,
        result.current.fields.goal.field.onChange,
      ),
    );
    expect(result.current.saveStatus).toBe('failed');
    expect(result.current.fields.goal.field.value).toMatchObject(nextChoice);
    await act(async () => result.current.retrySave());
    expect(userService.updateUserSettings).toHaveBeenCalledTimes(2);
    expect(vi.mocked(userService.updateUserSettings).mock.calls[1][0]).toEqual(
      vi.mocked(userService.updateUserSettings).mock.calls[0][0],
    );
    expect(result.current.saveStatus).toBe('saved');
    act(() =>
      useUserStore.setState({
        settings: { systemAgent: { goal: { model: 'fixture-third', provider: 'orvilo' } } },
      }),
    );
    await waitFor(() => expect(result.current.fields.goal.field.value.model).toBe('fixture-third'));
  });

  it('validates a legacy invalid context on submit without writing all fields', async () => {
    useUserStore.setState({
      settings: { systemAgent: { memoryAnalysisAgentConfig: { contextLimit: 0 } } },
    });
    const { result } = mount();
    let valid: boolean | undefined;
    await act(async () => {
      valid = await result.current.trigger();
    });
    expect(valid).toBe(false);
    expect(result.current.limitErrors.memoryAnalysisAgentConfig?.message).toBe(
      'serviceModel.contextLimit.placeholder',
    );
    expect(userService.updateUserSettings).not.toHaveBeenCalled();
    await act(async () =>
      result.current.changeContextLimit(
        'memoryAnalysisAgentConfig',
        8,
        result.current.limits.memoryAnalysisAgentConfig.field.onChange,
      ),
    );
    await waitFor(() =>
      expect(result.current.limits.memoryAnalysisAgentConfig.fieldState.error).toBeUndefined(),
    );
    expect(
      settingsSelectors.currentSystemAgent(useUserStore.getState()).memoryAnalysisAgentConfig
        .contextLimit,
    ).toBe(8);
  });

  it('preserves the real not-enabled provider fallback model/provider callback', async () => {
    useUserStore.setState({
      settings: { systemAgent: { expertise: { ...disabledSelection, customPrompt: 'keep' } } },
    });
    const { result } = mount();
    const fallback = resolveFallback();
    await act(async () =>
      result.current.changeSystemAgentModel(
        'expertise',
        fallback,
        result.current.fields.expertise.field.onChange,
      ),
    );
    expect(settingsSelectors.currentSystemAgent(useUserStore.getState()).expertise).toMatchObject({
      ...fallback,
      customPrompt: 'keep',
    });
    expect(
      vi.mocked(userService.updateUserSettings).mock.calls.at(-1)![0].systemAgent?.expertise,
    ).toMatchObject({ ...fallback, customPrompt: 'keep' });
  });

  it('blocks a captured late picker fallback callback after permission is revoked', async () => {
    const enable = deferred<void>(undefined);
    useUserStore.setState({ settings: { systemAgent: { expertise: disabledSelection } } });
    const { result, rerender } = mount();
    const { changeSystemAgentModel, fields } = result.current;
    // ModelSelect may deliver its existing callback after its enable request finishes.
    const lateCallback = async () => {
      await enable.promise;
      await changeSystemAgentModel('expertise', resolveFallback(), fields.expertise.field.onChange);
    };
    const pending = lateCallback();
    access.allowed = false;
    rerender();
    expect(result.current.canManageServiceModel).toBe(false);
    await act(async () => {
      enable.resolve();
      await pending;
    });
    expect(userService.updateUserSettings).not.toHaveBeenCalled();
    expect(settingsSelectors.currentSystemAgent(useUserStore.getState()).expertise.provider).toBe(
      'removed-provider',
    );
    expect(result.current.fields.expertise.field.value.provider).toBe('removed-provider');
  });

  it('keeps init failure distinct from loading and retries the existing state fetch', async () => {
    const initError = new Error('offline');
    useUserStore.setState({ isUserStateInit: false, isUserStateInitError: initError });
    const { result } = mount();
    expect(result.current.isUserStateInit).toBe(false);
    expect(result.current.isUserStateInitError).toBe(initError);
    await act(async () => result.current.refreshUserState());
    expect(useUserStore.getState().refreshUserState).toHaveBeenCalledOnce();
    act(() => useUserStore.setState({ isUserStateInitError: undefined }));
    expect(result.current.isUserStateInit).toBe(false);
    expect(result.current.isUserStateInitError).toBeUndefined();
  });
});
