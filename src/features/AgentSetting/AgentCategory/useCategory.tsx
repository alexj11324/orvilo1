import { Activity, LinkIcon, NotebookText } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { type MenuProps } from '@/components/Menu';
import { ChatSettingsTabs } from '@/store/global/initialState';
import { featureFlagsSelectors, useServerConfigStore } from '@/store/serverConfig';
import { useUserStore } from '@/store/user';
import { labPreferSelectors } from '@/store/user/selectors';

interface UseCategoryOptions {
  mobile?: boolean;
}

export const useCategory = ({ mobile }: UseCategoryOptions = {}) => {
  const { t } = useTranslation('setting');
  const iconSize = mobile ? 20 : undefined;
  const { enableAgentSelfIteration } = useServerConfigStore(featureFlagsSelectors);
  const enableSelfLearning = useUserStore(labPreferSelectors.enableSelfLearning);

  const cateItems: MenuProps['items'] = useMemo(
    () =>
      [
        enableSelfLearning && {
          icon: <NotebookText size={iconSize} />,
          key: ChatSettingsTabs.Rules,
          label: t('agentTab.rules'),
        },
        enableAgentSelfIteration && {
          icon: <Activity size={iconSize} />,
          key: ChatSettingsTabs.SelfIteration,
          label: t('agentTab.selfIteration'),
        },
        {
          icon: <LinkIcon size={iconSize} />,
          key: ChatSettingsTabs.Connector,
          label: t('agentTab.connector', 'Connectors'),
        },
      ].filter(Boolean) as MenuProps['items'],
    [t, iconSize, enableAgentSelfIteration, enableSelfLearning],
  );

  return cateItems;
};
