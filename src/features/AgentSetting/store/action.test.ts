import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createStore } from './index';

const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }));

vi.mock('@/components/toast', () => ({ toast: { error: toastError } }));
vi.mock('i18next', () => ({ default: {}, t: (key: string) => key }));
vi.mock('@/libs/analytics/client', () => ({ analyticsClient: { track: vi.fn() } }));

const setup = (handlers: {
  onConfigChange?: (config: unknown) => unknown;
  onMetaChange?: (meta: unknown) => unknown;
}) => {
  const store = createStore();
  store.setState(handlers as never);
  return store;
};

describe('AgentSetting store save feedback', () => {
  afterEach(() => vi.restoreAllMocks());
  beforeEach(() => {
    toastError.mockClear();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('tells the user when saving the config fails and keeps their edit', async () => {
    const store = setup({ onConfigChange: vi.fn().mockRejectedValue(new Error('boom')) });

    await store.getState().dispatchConfig({ config: { systemRole: 'edited' }, type: 'update' });

    expect(toastError).toHaveBeenCalledTimes(1);
    expect(toastError).toHaveBeenCalledWith('saveAgentConfigFail');
    expect(store.getState().saveStatus).toBe('idle');
    expect(store.getState().config.systemRole).toBe('edited');
  });

  it('does not report a superseded config failure after the latest edit saves', async () => {
    let rejectOld!: (error: Error) => void;
    const store = setup({
      onConfigChange: vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise((_resolve, reject) => {
              rejectOld = reject;
            }),
        )
        .mockResolvedValue(undefined),
    });
    const old = store.getState().dispatchConfig({ config: { systemRole: 'old' }, type: 'update' });
    await store.getState().dispatchConfig({ config: { systemRole: 'latest' }, type: 'update' });
    rejectOld(new Error('old save failed'));
    await old;
    expect(toastError).not.toHaveBeenCalled();
    expect(store.getState().saveStatus).toBe('saved');
    expect(store.getState().config.systemRole).toBe('latest');
  });

  it('tells the user when saving the meta fails', async () => {
    const store = setup({ onMetaChange: vi.fn().mockRejectedValue(new Error('boom')) });

    await store.getState().dispatchMeta({ type: 'update', value: { title: 'New title' } });

    expect(toastError).toHaveBeenCalledTimes(1);
    expect(toastError).toHaveBeenCalledWith('saveAgentConfigFail');
    expect(store.getState().meta.title).toBe('New title');
  });

  it('stays silent when the save was aborted', async () => {
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
    const store = setup({
      onConfigChange: vi.fn().mockRejectedValue(abort),
      onMetaChange: vi.fn().mockRejectedValue(abort),
    });

    await store.getState().dispatchConfig({ config: { systemRole: 'x' }, type: 'update' });
    await store.getState().dispatchMeta({ type: 'update', value: { title: 'x' } });

    expect(toastError).not.toHaveBeenCalled();
    expect(store.getState().saveStatus).toBe('idle');
  });

  it('shows no error and reports saved when the save succeeds', async () => {
    const store = setup({
      onConfigChange: vi.fn().mockResolvedValue(undefined),
      onMetaChange: vi.fn().mockResolvedValue(undefined),
    });

    await store.getState().dispatchConfig({ config: { systemRole: 'ok' }, type: 'update' });
    expect(store.getState().saveStatus).toBe('saved');
    await store.getState().dispatchMeta({ type: 'update', value: { title: 'ok' } });
    expect(store.getState().saveStatus).toBe('saved');
    expect(toastError).not.toHaveBeenCalled();
  });
});
