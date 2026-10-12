import { ThemeProvider } from '@lobehub/ui';
import { DEFAULT_SETTINGS } from '@orvilo/config';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@/components/ui/tooltip';
import { userService } from '@/services/user';
import { useAiInfraStore } from '@/store/aiInfra';
import { useUserStore } from '@/store/user';
import { settingsSelectors } from '@/store/user/selectors';
import { merge } from '@/utils/merge';

import ModelAssignmentsForm from './ModelAssignmentsForm';

// The actual form, RHF, local GroupForm/NumberField, ModelSelect, user store and
// settings actions execute. Only permission/resource and network boundaries are
// in memory. Undo the setup's Button/Switch stand-ins for the real picker remedy.
vi.unmock('@lobehub/ui/base-ui');
const access = vi.hoisted(() => ({ allowed: true, reason: undefined as string | undefined }));
vi.mock('@/hooks/usePermission', () => ({ usePermission: () => access }));
vi.mock('@/services/user', () => ({
  userService: { updateUserSettings: vi.fn(), resetUserSettings: vi.fn() },
}));
dayjs.extend(relativeTime);

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
const deferred = () => {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<typeof settingsUpdateResult>((yes, no) => {
    resolve = () => yes(settingsUpdateResult);
    reject = no;
  });
  return { promise, reject, resolve };
};
const row = (key: 'defaultAgent' | (typeof rowKeys)[number]) => {
  const label = key === 'defaultAgent' ? 'defaultAgent.title' : `systemAgent.${key}.title`;
  const node = screen.getByText(label).closest('[data-slot="form-item"], .ant-form-item');
  if (!node) throw new Error(`Missing real form row for ${label}`);
  return within(node as HTMLElement);
};
const mount = () =>
  render(
    <ThemeProvider enableCustomFonts={false} enableGlobalStyle={false}>
      <TooltipProvider>
        <ModelAssignmentsForm />
      </TooltipProvider>
    </ThemeProvider>,
  );
const pick = async (key: 'defaultAgent' | (typeof rowKeys)[number], name: string) => {
  const user = userEvent.setup();
  await user.click(row(key).getByRole('combobox'));
  await user.click(await screen.findByRole('option', { name: new RegExp(name) }));
};
const limit = (key: (typeof rowKeys)[number]) =>
  row(key).getByPlaceholderText('serviceModel.contextLimit.placeholder') as HTMLInputElement;

describe('ModelAssignmentsForm owned autosave', () => {
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
    const chatModels = [
      { abilities: {}, displayName: 'Fixture Current', id: 'fixture-current' },
      { abilities: {}, displayName: 'Fixture Next', id: 'family/fixture-next' },
      { abilities: {}, displayName: 'Fixture Third', id: 'fixture-third' },
    ];
    const embeddingModels = [
      { abilities: {}, displayName: 'Fixture Embedding', id: 'fixture-embedding' },
      { abilities: {}, displayName: 'Fixture Embedding Next', id: 'fixture-embedding-next' },
    ];
    useAiInfraStore.setState({
      builtinAiModelList: [],
      enabledAiProviders: [{ id: 'orvilo', name: 'Orvilo', source: 'builtin' }],
      enabledChatModelList: [
        { children: chatModels, id: 'orvilo', name: 'Orvilo', source: 'builtin' },
      ],
      enabledEmbeddingModelList: [
        { children: embeddingModels, id: 'orvilo', name: 'Orvilo', source: 'builtin' },
      ],
      isInitAiProviderRuntimeState: true,
      modelRedirects: {},
      toggleProviderEnabled: vi.fn().mockResolvedValue(undefined),
      toggleProviderModelEnabled: vi.fn().mockResolvedValue(undefined),
    });
  });

  afterEach(() => {
    cleanup();
    useUserStore.setState(originalActions);
    vi.restoreAllMocks();
  });

  it('renders the six existing rows, both anchors and only the three context limits', () => {
    const { container } = mount();
    expect(screen.getAllByRole('combobox')).toHaveLength(6);
    expect(screen.getAllByPlaceholderText('serviceModel.contextLimit.placeholder')).toHaveLength(3);
    expect(
      container.querySelector('[data-settings-anchor="service-model-assignments"]'),
    ).toBeTruthy();
    expect(container.querySelector('[data-settings-anchor="service-model-memory"]')).toBeTruthy();
    expect(screen.getByText('systemAgent.goal.modelDesc')).toBeTruthy();
    expect(screen.queryByText('systemAgent.translation.title')).toBeNull();
  });

  it.each(['defaultAgent', ...rowKeys.filter((key) => key !== 'userMemoryEmbedding')] as const)(
    'autosaves the full model/provider pair through the real %s settings action',
    async (key) => {
      mount();
      await pick(key, 'Fixture Next');
      await waitFor(() => expect(userService.updateUserSettings).toHaveBeenCalled());
      const payload = vi.mocked(userService.updateUserSettings).mock.calls.at(-1)![0];
      const selected =
        key === 'defaultAgent' ? payload.defaultAgent?.config : payload.systemAgent?.[key];
      expect(selected).toMatchObject({ model: 'family/fixture-next', provider: 'orvilo' });
      expect(payload).not.toHaveProperty('general');
      expect(payload).not.toHaveProperty('tool');
      expect(settingsSelectors.currentSystemAgent(useUserStore.getState()).expertise).toMatchObject(
        { customPrompt: 'keep this prompt', enabled: false },
      );
      await screen.findByText(/autoSave.saved/);
    },
  );

  it('keeps embedding catalog filtering and writes the original embedding path', async () => {
    mount();
    await userEvent.setup().click(row('userMemoryEmbedding').getByRole('combobox'));
    expect(screen.queryByRole('option', { name: /Fixture Next/ })).toBeNull();
    await userEvent
      .setup()
      .click(await screen.findByRole('option', { name: /Fixture Embedding Next/ }));
    await waitFor(() =>
      expect(userService.updateUserSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          systemAgent: expect.objectContaining({
            userMemoryEmbedding: expect.objectContaining({
              model: 'fixture-embedding-next',
              provider: 'orvilo',
            }),
          }),
        }),
        expect.any(AbortSignal),
      ),
    );
  });

  it.each(['memoryAnalysisAgentConfig', 'userMemoryPersonaWriter', 'userMemoryEmbedding'] as const)(
    'preserves numeric, clearing and stepper autosave callbacks for %s',
    async (key) => {
      const action = vi.spyOn(useUserStore.getState(), 'updateSystemAgent');
      mount();
      fireEvent.change(limit(key), { target: { value: '32' } });
      await waitFor(() => expect(action).toHaveBeenCalledWith(key, { contextLimit: 32 }));
      expect(settingsSelectors.currentSystemAgent(useUserStore.getState())[key].contextLimit).toBe(
        32,
      );
      fireEvent.change(limit(key), { target: { value: '' } });
      await waitFor(() => expect(action).toHaveBeenCalledWith(key, { contextLimit: undefined }));
      // No null leaks into the existing action/server contract. RHF's empty value is null.
      await userEvent.setup().click(row(key).getByRole('button', { name: /placeholder \+1/ }));
      await waitFor(() =>
        expect(action.mock.calls.at(-1)?.[1].contextLimit).toEqual(expect.any(Number)),
      );
      expect(action.mock.calls.at(-1)?.[1].contextLimit).toBeGreaterThanOrEqual(1);
    },
  );

  it('disables every model, numeric input and stepper when permission is denied', async () => {
    access.allowed = false;
    access.reason = 'readonly fixture';
    mount();
    for (const picker of screen.getAllByRole('combobox')) expect(picker).toBeDisabled();
    for (const input of screen.getAllByPlaceholderText('serviceModel.contextLimit.placeholder'))
      expect(input).toBeDisabled();
    for (const button of screen.getAllByRole('button', { name: /placeholder [−+]1/ }))
      expect(button).toBeDisabled();
    await userEvent.setup().click(row('memoryAnalysisAgentConfig').getByRole('combobox'));
    expect(userService.updateUserSettings).not.toHaveBeenCalled();
    expect(useAiInfraStore.getState().toggleProviderModelEnabled).not.toHaveBeenCalled();
  });

  it('keeps the latest group saved after an older request fails without rolling back its edits', async () => {
    const older = deferred();
    const newer = deferred();
    vi.mocked(userService.updateUserSettings)
      .mockImplementationOnce(() => older.promise)
      .mockImplementationOnce(() => newer.promise);
    mount();
    await pick('defaultAgent', 'Fixture Next');
    fireEvent.change(limit('memoryAnalysisAgentConfig'), { target: { value: '40' } });
    await waitFor(() => expect(userService.updateUserSettings).toHaveBeenCalledTimes(2));
    const [first, second] = vi.mocked(userService.updateUserSettings).mock.calls;
    expect(first[1]?.aborted).toBe(true);
    expect(second[0]).toHaveProperty('defaultAgent.config.model', 'family/fixture-next');
    expect(second[0]).toHaveProperty('systemAgent.memoryAnalysisAgentConfig.contextLimit', 40);
    await act(async () => {
      newer.resolve();
      await newer.promise;
    });
    await screen.findByText(/autoSave.saved/);
    await act(async () => {
      older.reject(new Error('superseded abort'));
      await Promise.resolve();
    });
    expect(screen.queryByText(/autoSave.failed/)).toBeNull();
    expect(limit('memoryAnalysisAgentConfig').value).toBe('40');
    expect(settingsSelectors.defaultAgent(useUserStore.getState()).config.model).toBe(
      'family/fixture-next',
    );
  });

  it('shows a current failure, retains the draft and retries the same action before accepting a server refresh', async () => {
    vi.mocked(userService.updateUserSettings).mockRejectedValueOnce(new Error('offline'));
    const action = vi.spyOn(useUserStore.getState(), 'updateSystemAgent');
    mount();
    await pick('goal', 'Fixture Next');
    const failedHint = await screen.findByText(/autoSave.failed.*autoSave.retry/);
    expect(row('goal').getByRole('combobox').textContent).toContain('Fixture Next');
    await userEvent.setup().click(failedHint);
    await waitFor(() => expect(action).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(userService.updateUserSettings).toHaveBeenCalledTimes(2));
    expect(vi.mocked(userService.updateUserSettings).mock.calls[1][0]).toEqual(
      vi.mocked(userService.updateUserSettings).mock.calls[0][0],
    );
    expect(action.mock.calls[0]).toEqual([
      'goal',
      { model: 'family/fixture-next', provider: 'orvilo' },
    ]);
    expect(action.mock.calls[1]).toEqual(action.mock.calls[0]);
    await screen.findByText(/autoSave.saved/);
    // Canonical refresh/rollback is owned by the store, not a captured form snapshot.
    act(() =>
      useUserStore.setState({
        settings: {
          systemAgent: { goal: { model: 'fixture-third', provider: 'orvilo' } },
        },
      }),
    );
    await waitFor(() =>
      expect(row('goal').getByRole('combobox').textContent).toContain('Fixture Third'),
    );
  });

  it('validates a legacy invalid context on submit without writing all fields', async () => {
    useUserStore.setState({
      settings: { systemAgent: { memoryAnalysisAgentConfig: { contextLimit: 0 } } },
    });
    const { container } = mount();
    fireEvent.submit(container.querySelector('form')!);
    await waitFor(() =>
      expect(limit('memoryAnalysisAgentConfig')).toHaveAttribute('aria-invalid', 'true'),
    );
    expect(userService.updateUserSettings).not.toHaveBeenCalled();
    fireEvent.change(limit('memoryAnalysisAgentConfig'), { target: { value: '8' } });
    await waitFor(() =>
      expect(limit('memoryAnalysisAgentConfig')).not.toHaveAttribute('aria-invalid'),
    );
  });

  it('keeps the real not-enabled provider fallback and its full model/provider callback', async () => {
    useUserStore.setState({
      settings: {
        systemAgent: {
          expertise: {
            model: 'fixture-disabled',
            provider: 'removed-provider',
            customPrompt: 'keep',
          },
        },
      },
    });
    useAiInfraStore.setState({
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
    });
    mount();
    await userEvent.setup().click(row('expertise').getByRole('combobox'));
    await userEvent
      .setup()
      .click(
        await screen.findByRole('switch', { name: 'ModelSelect.staleModel.notEnabled.action' }),
      );
    await waitFor(() =>
      expect(useAiInfraStore.getState().toggleProviderModelEnabled).toHaveBeenCalledWith({
        enabled: true,
        id: 'fixture-disabled',
        providerId: 'orvilo',
        type: 'chat',
      }),
    );
    await waitFor(() =>
      expect(userService.updateUserSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          systemAgent: expect.objectContaining({
            expertise: expect.objectContaining({
              model: 'fixture-disabled',
              provider: 'orvilo',
              customPrompt: 'keep',
            }),
          }),
        }),
        expect.any(AbortSignal),
      ),
    );
  });

  it('blocks a late picker fallback callback after permission is revoked', async () => {
    const enable = deferred();
    useUserStore.setState({
      settings: {
        systemAgent: {
          expertise: {
            model: 'fixture-disabled',
            provider: 'removed-provider',
          },
        },
      },
    });
    useAiInfraStore.setState({
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
      toggleProviderModelEnabled: vi.fn(() => enable.promise),
    });
    mount();
    await userEvent.setup().click(row('expertise').getByRole('combobox'));
    await userEvent.setup().click(
      await screen.findByRole('switch', {
        name: 'ModelSelect.staleModel.notEnabled.action',
      }),
    );
    await waitFor(() =>
      expect(useAiInfraStore.getState().toggleProviderModelEnabled).toHaveBeenCalledOnce(),
    );
    access.allowed = false;
    // The real store subscription supplies a render, as the public permission
    // resource would in production; the in-flight picker keeps its old callback.
    act(() => useUserStore.setState({ refreshUserState: vi.fn().mockResolvedValue(undefined) }));
    await waitFor(() => expect(row('expertise').getByRole('combobox')).toBeDisabled());
    await act(async () => {
      enable.resolve();
      await enable.promise;
    });
    expect(userService.updateUserSettings).not.toHaveBeenCalled();
    expect(settingsSelectors.currentSystemAgent(useUserStore.getState()).expertise.provider).toBe(
      'removed-provider',
    );
  });

  it('keeps init failure distinct from loading and retries the existing state fetch', async () => {
    useUserStore.setState({ isUserStateInit: false, isUserStateInitError: new Error('offline') });
    mount();
    expect(screen.queryByRole('combobox')).toBeNull();
    await userEvent.setup().click(screen.getByRole('button', { name: 'error.retry' }));
    expect(useUserStore.getState().refreshUserState).toHaveBeenCalledOnce();
  });
});
