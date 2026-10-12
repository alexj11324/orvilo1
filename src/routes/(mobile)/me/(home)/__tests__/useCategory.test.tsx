import { DOWNLOAD_URL } from '@orvilo/const';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type * as ConstVersionModule from '@/const/version';
import { ServerConfigStoreProvider } from '@/store/serverConfig/Provider';
import { createServerConfigStore } from '@/store/serverConfig/store';
import { useUserStore } from '@/store/user';

import { useCategory } from '../features/useCategory';

const branding = vi.hoisted(() => ({ help: 'https://docs.example.com' as string | undefined }));
vi.mock('@orvilo/business-const', async (importOriginal) => {
  const actual = await importOriginal<{ BRANDING_URL: Record<string, string | undefined> }>();
  return {
    ...actual,
    BRANDING_URL: {
      ...actual.BRANDING_URL,
      get help() {
        return branding.help;
      },
    },
  };
});

// A deployment that publishes a documentation site and a changelog.
const wrapper: React.JSXElementConstructor<{ children: React.ReactNode }> = ({ children }) => (
  <ServerConfigStoreProvider featureFlags={{ changelog: true }}>
    {children}
  </ServerConfigStoreProvider>
);

vi.mock('@/hooks/usePlatform', () => ({ usePlatform: () => ({ isIOS: true, isAndroid: false }) }));

// Mock dependencies
const mockNavigate = vi.fn();
vi.mock('react-router', () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock('react-i18next', () => ({
  useTranslation: vi.fn(() => ({
    t: vi.fn((key) => key),
  })),
}));

// Mock version constants
vi.mock('@/const/version', async (importOriginal) => {
  const actual = await importOriginal<typeof ConstVersionModule>();
  return {
    ...actual,
    isServerMode: false,
  };
});

afterEach(() => {
  mockNavigate.mockReset();
  branding.help = 'https://docs.example.com';
});

describe('useCategory', () => {
  it('opens the desktop download destination even on a phone', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    try {
      const { result } = renderHook(() => useCategory(), { wrapper });
      act(() => result.current.find((item) => item.key === 'get-desktop-app')?.onClick?.());
      expect(open).toHaveBeenCalledWith(DOWNLOAD_URL.default, '_blank', 'noopener,noreferrer');
    } finally {
      open.mockRestore();
    }
  });

  it('opens every external link in a fresh tab that cannot reach the opener', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    try {
      const { result } = renderHook(() => useCategory(), { wrapper });
      for (const key of ['docs', 'feedback']) {
        act(() => result.current.find((item) => item.key === key)?.onClick?.());
      }
      expect(open).toHaveBeenCalledTimes(2);
      for (const call of open.mock.calls) {
        expect(call.slice(1)).toEqual(['_blank', 'noopener,noreferrer']);
      }
    } finally {
      open.mockRestore();
    }
  });

  it('should return correct items when the user is logged in with authentication', () => {
    act(() => {
      useUserStore.setState({ isSignedIn: true });
    });

    const { result } = renderHook(() => useCategory(), { wrapper });

    act(() => {
      const items = result.current;
      expect(items.some((item) => item.key === 'profile')).toBe(true);
      expect(items.some((item) => item.key === 'setting')).toBe(true);
      expect(items.some((item) => item.key === 'docs')).toBe(true);
      expect(items.some((item) => item.key === 'feedback')).toBe(true);
      expect(items.some((item) => item.key === 'changelog')).toBe(true);
    });
  });

  it('should return correct items when the user is not logged in', () => {
    act(() => {
      useUserStore.setState({ isSignedIn: false });
    });

    const { result } = renderHook(() => useCategory(), { wrapper });

    act(() => {
      const items = result.current;
      expect(items.some((item) => item.key === 'profile')).toBe(false);
      expect(items.some((item) => item.key === 'setting')).toBe(false);
      expect(items.some((item) => item.key === 'data')).toBe(false);
      expect(items.some((item) => item.key === 'docs')).toBe(true);
      expect(items.some((item) => item.key === 'feedback')).toBe(true);
      expect(items.some((item) => item.key === 'changelog')).toBe(true);
    });
  });

  // Regression: the docs row linked to a hosted documentation site whether or
  // not the deployment had one, and the changelog row ignored its own flag.
  it('drops the docs and changelog entries when the deployment offers neither', () => {
    branding.help = undefined;
    // The config store is one instance per module graph, so the flag is
    // flipped on it and put back rather than supplied through a second provider.
    const store = createServerConfigStore();
    const featureFlags = store.getState().featureFlags;
    store.setState({ featureFlags: { ...featureFlags, showChangelog: false } });

    try {
      const { result } = renderHook(() => useCategory(), { wrapper });

      expect(result.current.some((item) => item.key === 'docs')).toBe(false);
      expect(result.current.some((item) => item.key === 'changelog')).toBe(false);
      expect(result.current.some((item) => item.key === 'feedback')).toBe(true);
    } finally {
      store.setState({ featureFlags });
    }
  });
});
