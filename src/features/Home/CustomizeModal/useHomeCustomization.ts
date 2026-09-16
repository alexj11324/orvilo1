import { useCallback } from 'react';

import { useHomeUsageWidgetActive } from '@/business/client/features/HomeUsageWidget';
import { useGlobalStore } from '@/store/global';
import { systemStatusSelectors } from '@/store/global/selectors';

import {
  HOME_COUNT_MAX,
  HOME_COUNT_MIN,
  HOME_CUSTOMIZE_DEFAULTS,
  HOME_PRESETS,
  type HomePresetKey,
  type HomeWidgetKey,
  isHomeMinimalLayout,
  isHomeWidgetHidden,
  resolveHomePreset,
} from './config';

export const toggleHiddenWidget = (hidden: string[], key: HomeWidgetKey): string[] =>
  hidden.includes(key) ? hidden.filter((item) => item !== key) : [...hidden, key];

export const clampHomeCount = (value: number): number =>
  Math.min(HOME_COUNT_MAX, Math.max(HOME_COUNT_MIN, value));

interface HomeCustomization {
  applyPreset: (key: HomePresetKey) => void;
  hiddenWidgets: string[];
  isWidgetHidden: (key: HomeWidgetKey) => boolean;
  preset: HomePresetKey | undefined;
  recentsCount: number;
  reset: () => void;
  setRecentsCount: (value: number) => void;
  setTaskCount: (value: number) => void;
  taskCount: number;
  toggleWidget: (key: HomeWidgetKey) => void;
  /** Whether the business usage widget exists here — gates its switch. */
  usageActive: boolean;
}

export const useHomeMinimalLayout = (): boolean => {
  const hiddenWidgets = useGlobalStore(systemStatusSelectors.hiddenHomeWidgets);
  const usageActive = useHomeUsageWidgetActive();

  return isHomeMinimalLayout(hiddenWidgets, usageActive);
};

export const useHomeCustomization = (): HomeCustomization => {
  const usageActive = useHomeUsageWidgetActive();
  const hiddenWidgets = useGlobalStore(systemStatusSelectors.hiddenHomeWidgets);
  const recentsCount = useGlobalStore(systemStatusSelectors.homeRecentsCount);
  const taskCount = useGlobalStore(systemStatusSelectors.homeTaskCount);
  const updateSystemStatus = useGlobalStore((s) => s.updateSystemStatus);

  const toggleWidget = useCallback(
    (key: HomeWidgetKey) => {
      updateSystemStatus(
        { hiddenHomeWidgets: toggleHiddenWidget(hiddenWidgets, key) },
        'homeCustomize',
      );
    },
    [hiddenWidgets, updateSystemStatus],
  );

  const setRecentsCount = useCallback(
    (value: number) => {
      updateSystemStatus({ homeRecentsCount: clampHomeCount(value) }, 'homeCustomize');
    },
    [updateSystemStatus],
  );

  const setTaskCount = useCallback(
    (value: number) => {
      updateSystemStatus({ homeTaskCount: clampHomeCount(value) }, 'homeCustomize');
    },
    [updateSystemStatus],
  );

  const applyPreset = useCallback(
    (key: HomePresetKey) => {
      const preset = HOME_PRESETS[key];

      updateSystemStatus(
        {
          hiddenHomeWidgets: [...preset.hiddenWidgets],
          homeRecentsCount: preset.count,
          homeTaskCount: preset.count,
        },
        'homeCustomize',
      );
    },
    [updateSystemStatus],
  );

  const reset = useCallback(() => {
    updateSystemStatus(HOME_CUSTOMIZE_DEFAULTS, 'homeCustomize');
  }, [updateSystemStatus]);

  const isWidgetHidden = useCallback(
    (key: HomeWidgetKey) => isHomeWidgetHidden(key, hiddenWidgets),
    [hiddenWidgets],
  );

  return {
    applyPreset,
    hiddenWidgets,
    isWidgetHidden,
    preset: resolveHomePreset(hiddenWidgets, usageActive),
    recentsCount,
    reset,
    setRecentsCount,
    setTaskCount,
    taskCount,
    toggleWidget,
    usageActive,
  };
};
