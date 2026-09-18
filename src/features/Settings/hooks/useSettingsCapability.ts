'use client';

import { isDesktop } from '@orvilo/const';
import { useMemo } from 'react';

import { type SettingsCapabilityContext } from '@/config/routes/settings';
import {
  featureFlagsSelectors,
  serverConfigSelectors,
  useServerConfigStore,
} from '@/store/serverConfig';
import { useUserStore } from '@/store/user';
import { userGeneralSettingsSelectors } from '@/store/user/slices/settings/selectors';

/**
 * Reads the stores the settings capability registry asks about.
 *
 * The registry (`@/config/routes/settings`) is deliberately pure, so every
 * surface that needs a decision — the settings page renderer, the personal
 * sidebar, the mobile sidebar — builds the context here instead of reaching for
 * its own flags. Before this existed, each of those sites read the same four
 * flags on its own, which is how their answers drifted apart.
 */
export const useSettingsCapabilityContext = (): SettingsCapabilityContext => {
  const mobile = useServerConfigStore(serverConfigSelectors.isMobile);
  const { hideDocs, showApiKeyManage } = useServerConfigStore(featureFlagsSelectors);
  const enableBusinessFeatures = useServerConfigStore(serverConfigSelectors.enableBusinessFeatures);
  const isDevMode = useUserStore((s) => userGeneralSettingsSelectors.config(s).isDevMode);

  return useMemo(
    () => ({
      enableBusinessFeatures,
      hideDocs: !!hideDocs,
      isDesktop,
      isDevMode: !!isDevMode,
      mobile,
      showApiKeyManage: !!showApiKeyManage,
    }),
    [enableBusinessFeatures, hideDocs, isDevMode, mobile, showApiKeyManage],
  );
};
