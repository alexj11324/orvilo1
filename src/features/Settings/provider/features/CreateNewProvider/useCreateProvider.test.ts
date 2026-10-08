import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useCreateProvider } from './useCreateProvider';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  navigate: vi.fn(),
  error: vi.fn(),
  success: vi.fn(),
  network: vi.fn(),
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/store/aiInfra/store', () => ({
  useAiInfraStore: (selector: (s: object) => unknown) =>
    selector({ createNewAiProvider: mocks.create }),
}));
vi.mock('@/features/Workspace/useWorkspaceAwareNavigate', () => ({
  useWorkspaceAwareNavigate: () => mocks.navigate,
}));
vi.mock('@/components/toast', () => ({ toast: { error: mocks.error, success: mocks.success } }));
vi.mock('@/components/Error/remoteServerErrorToast', () => ({
  remoteServerErrorToast: mocks.network,
}));
describe('provider creation recovery', () => {
  beforeEach(() => vi.clearAllMocks());
  it.each([
    [new Error('server rejected'), 'server rejected'],
    [undefined, 'createNewAiProvider.createFailed'],
  ])('keeps the form open after rejection and permits retry', async (error, message) => {
    const close = vi.fn();
    mocks.create.mockRejectedValueOnce(error).mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useCreateProvider(close));
    await act(async () =>
      result.current.onFinish({ id: 'custom', name: 'Custom', source: 'custom' }),
    );
    expect(mocks.error).toHaveBeenCalledWith(message);
    expect(close).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
    await act(async () =>
      result.current.onFinish({ id: 'custom', name: 'Custom', source: 'custom' }),
    );
    expect(close).toHaveBeenCalledOnce();
    expect(mocks.navigate).toHaveBeenCalledWith('/settings/provider/custom');
  });
  it('deduplicates Desktop proxy failures through the shared toast', async () => {
    mocks.create.mockRejectedValue({
      meta: {
        response: new Response('', { status: 502, headers: { 'X-Proxy-Error': '1' } }),
        responseJSON: { errorType: 'RemoteServerOffline' },
      },
    });
    const { result } = renderHook(() => useCreateProvider(vi.fn()));
    await act(async () =>
      result.current.onFinish({ id: 'custom', name: 'Custom', source: 'custom' }),
    );
    expect(mocks.network).toHaveBeenCalledWith('RemoteServerOffline');
    expect(mocks.error).not.toHaveBeenCalled();
  });
});
