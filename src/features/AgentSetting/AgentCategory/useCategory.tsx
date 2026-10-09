import { Activity, Handshake, LinkIcon, NotebookText } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { type MenuItemType, type MenuProps } from '@/components/Menu';
import { useAgentStore } from '@/store/agent';
import { builtinAgentSelectors } from '@/store/agent/selectors';
import { ChatSettingsTabs } from '@/store/global/initialState';
import { featureFlagsSelectors, useServerConfigStore } from '@/store/serverConfig';

interface UseCategoryOptions {
  mobile?: boolean;
}

export const useCategory = ({ mobile }: UseCategoryOptions = {}) => {
  const { t } = useTranslation('setting');
  const iconSize = mobile ? 20 : undefined;
  const isInbox = useAgentStore(builtinAgentSelectors.isInboxAgent);
  const { enableAgentSelfIteration } = useServerConfigStore(featureFlagsSelectors);

  const cateItems: MenuProps['items'] = useMemo(
    () =>
      [
        (!isInbox && {
          icon: <Handshake size={iconSize} />,
          key: ChatSettingsTabs.Opening,
          label: t('agentTab.opening'),
        }) as MenuItemType,
        {
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
    [t, isInbox, iconSize, enableAgentSelfIteration],
  );

  return cateItems;
};
