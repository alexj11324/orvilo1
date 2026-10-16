import { act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_FEATURE_FLAGS, mapFeatureFlagsEnvToState } from '@/config/featureFlags';

import { initServerConfigStore } from '../../store';
import { DEV_FLAG_OVERRIDE_SCHEMA_VERSION, DEV_FLAG_OVERRIDE_STORAGE_KEY } from './constants';

const baseFeatureFlags = mapFeatureFlagsEnvToState(DEFAULT_FEATURE_FLAGS);

const createStore = () => initServerConfigStore({ featureFlags: { ...baseFeatureFlags } });

const writeStorage = (overrides: Record<string, boolean>) => {
  window.localStorage.setItem(
    DEV_FLAG_OVERRIDE_STORAGE_KEY,
    JSON.stringify({ version: DEV_FLAG_OVERRIDE_SCHEMA_VERSION, overrides }),
  );
};

const readStorage = () => {
  const raw = window.localStorage.getItem(DEV_FLAG_OVERRIDE_STORAGE_KEY);
  return raw ? JSON.parse(raw) : null;
};

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'development');
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('featureFlagOverride slice', () => {
  describe('syncDevFlagOverrides', () => {
    it('snapshots current featureFlags as _originalFeatureFlags', () => {
      const store = createStore();

      act(() => store.getState().syncDevFlagOverrides());

      expect(store.getState()._originalFeatureFlags).toEqual(baseFeatureFlags);
      expect(store.getState()._featureFlagOverrides).toEqual({});
    });

    it('merges valid persisted overrides into featureFlags after snapshot', () => {
      writeStorage({ enableAgentOnboarding: true, enableVoiceDictation: true });

      const store = createStore();
      act(() => store.getState().syncDevFlagOverrides());

      expect(store.getState().featureFlags.enableAgentOnboarding).toBe(true);
      expect(store.getState().featureFlags.enableVoiceDictation).toBe(true);
      expect(store.getState()._featureFlagOverrides).toEqual({
        enableAgentOnboarding: true,
        enableVoiceDictation: true,
      });
      // original snapshot stays untouched by the override merge
      expect(store.getState()._originalFeatureFlags?.enableVoiceDictation).toBe(false);
    });

    it('drops unknown keys from persisted overrides with a warning', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      writeStorage({ enableAgentOnboarding: true, somethingObsolete: true });

      const store = createStore();
      act(() => store.getState().syncDevFlagOverrides());

      expect(store.getState()._featureFlagOverrides).toEqual({ enableAgentOnboarding: true });
      expect(warn).toHaveBeenCalled();
    });

    it('drops non-boolean values from persisted overrides', () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      writeStorage({
        enableAgentOnboarding: true,
        enableVoiceDictation: 'yes' as unknown as boolean,
      });

      const store = createStore();
      act(() => store.getState().syncDevFlagOverrides());

      expect(store.getState()._featureFlagOverrides).toEqual({ enableAgentOnboarding: true });
    });

    it('drops all persisted overrides on schema version mismatch', () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      window.localStorage.setItem(
        DEV_FLAG_OVERRIDE_STORAGE_KEY,
        JSON.stringify({ version: 999, overrides: { enableAgentOnboarding: true } }),
      );

      const store = createStore();
      act(() => store.getState().syncDevFlagOverrides());

      expect(store.getState()._featureFlagOverrides).toEqual({});
      expect(window.localStorage.getItem(DEV_FLAG_OVERRIDE_STORAGE_KEY)).toBeNull();
    });

    it('survives corrupt JSON in localStorage', () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      window.localStorage.setItem(DEV_FLAG_OVERRIDE_STORAGE_KEY, '{not-json');

      const store = createStore();
      act(() => store.getState().syncDevFlagOverrides());

      expect(store.getState()._featureFlagOverrides).toEqual({});
      expect(store.getState()._originalFeatureFlags).toEqual(baseFeatureFlags);
    });

    it('re-snapshots when called again with fresh server flags', () => {
      const store = createStore();
      act(() => store.getState().syncDevFlagOverrides());
      act(() => store.getState().setFlagOverride('enableVoiceDictation', false));

      const fresher = {
        ...baseFeatureFlags,
        enableVoiceDictation: false,
      } as typeof baseFeatureFlags;
      act(() => store.setState({ featureFlags: fresher }));
      act(() => store.getState().syncDevFlagOverrides());

      expect(store.getState()._originalFeatureFlags?.enableVoiceDictation).toBe(false);
      // Override still applied on top of new server truth
      expect(store.getState()._featureFlagOverrides.enableVoiceDictation).toBe(false);
    });

    it('hydrates overrides in production for an authorized DevDock session', () => {
      vi.stubEnv('NODE_ENV', 'production');
      writeStorage({ enableVoiceDictation: false });
      const store = createStore();

      act(() => store.getState().syncDevFlagOverrides());

      expect(store.getState()._originalFeatureFlags).toEqual(baseFeatureFlags);
      expect(store.getState().featureFlags.enableVoiceDictation).toBe(false);
    });

    it('drops persisted attempts to override DevDock authorization', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      writeStorage({ enableDevDock: false, enableVoiceDictation: false });
      const store = createStore();

      act(() => store.getState().syncDevFlagOverrides());

      expect(store.getState()._featureFlagOverrides).toEqual({ enableVoiceDictation: false });
      expect(warn).toHaveBeenCalledWith(
        '[DevFlagOverride] dropping unknown override key: enableDevDock',
      );
    });
  });

  describe('setFlagOverride', () => {
    it('writes a true override and mutates featureFlags', () => {
      const store = createStore();
      act(() => store.getState().syncDevFlagOverrides());

      act(() => store.getState().setFlagOverride('enableAgentOnboarding', true));

      expect(store.getState()._featureFlagOverrides.enableAgentOnboarding).toBe(true);
      expect(store.getState().featureFlags.enableAgentOnboarding).toBe(true);
      expect(readStorage().overrides).toEqual({ enableAgentOnboarding: true });
    });

    it('writes a false override and mutates featureFlags', () => {
      const store = createStore();
      act(() => store.getState().syncDevFlagOverrides());

      act(() => store.getState().setFlagOverride('enableVoiceDictation', false));

      expect(store.getState()._featureFlagOverrides.enableVoiceDictation).toBe(false);
      expect(store.getState().featureFlags.enableVoiceDictation).toBe(false);
    });

    it('clears an override and restores featureFlags from snapshot', () => {
      const store = createStore();
      act(() => store.getState().syncDevFlagOverrides());
      act(() => store.getState().setFlagOverride('enableVoiceDictation', false));

      act(() => store.getState().setFlagOverride('enableVoiceDictation', undefined));

      expect(store.getState()._featureFlagOverrides.enableVoiceDictation).toBeUndefined();
      expect(store.getState().featureFlags.enableVoiceDictation).toBe(
        baseFeatureFlags.enableVoiceDictation,
      );
      expect(readStorage()).toBeNull();
    });

    it('is a no-op before sync (original snapshot missing)', () => {
      const store = createStore();

      act(() => store.getState().setFlagOverride('enableVoiceDictation', false));

      expect(store.getState()._featureFlagOverrides).toEqual({});
      expect(readStorage()).toBeNull();
    });

    it('writes overrides in production for an authorized DevDock session', () => {
      const store = createStore();
      act(() => store.getState().syncDevFlagOverrides());

      vi.stubEnv('NODE_ENV', 'production');
      act(() => store.getState().setFlagOverride('enableVoiceDictation', false));

      expect(store.getState()._featureFlagOverrides).toEqual({ enableVoiceDictation: false });
    });
  });

  describe('resetFlagOverrides', () => {
    it('clears overrides and restores featureFlags from snapshot', () => {
      const store = createStore();
      act(() => store.getState().syncDevFlagOverrides());
      act(() => store.getState().setFlagOverride('enableVoiceDictation', false));
      act(() => store.getState().setFlagOverride('enableAgentOnboarding', true));

      act(() => store.getState().resetFlagOverrides());

      expect(store.getState()._featureFlagOverrides).toEqual({});
      expect(store.getState().featureFlags).toEqual(baseFeatureFlags);
      expect(readStorage()).toBeNull();
    });

    it('resets overrides in production for an authorized DevDock session', () => {
      const store = createStore();
      act(() => store.getState().syncDevFlagOverrides());
      act(() => store.getState().setFlagOverride('enableVoiceDictation', false));

      vi.stubEnv('NODE_ENV', 'production');
      act(() => store.getState().resetFlagOverrides());

      expect(store.getState()._featureFlagOverrides).toEqual({});
      expect(store.getState().featureFlags).toEqual(baseFeatureFlags);
    });
  });
});
