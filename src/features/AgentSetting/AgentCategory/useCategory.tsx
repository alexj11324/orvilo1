import { Icon } from '@lobehub/ui';
import { type MenuItemType } from 'antd/es/menu/interface';
import { Activity, Bot, Handshake, LinkIcon, NotebookText } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { type MenuProps } from '@/components/Menu';
import { useAgentStore } from '@/store/agent';
import { builtinAgentSelectors } from '@/store/agent/selectors';
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
  const isInbox = useAgentStore(builtinAgentSelectors.isInboxAgent);
  const { enableAgentSelfIteration } = useServerConfigStore(featureFlagsSelectors);
  const enableSelfLearning = useUserStore(labPreferSelectors.enableSelfLearning);

  const cateItems: MenuProps['items'] = useMemo(
    () =>
      [
        {
          icon: <Icon icon={Bot} size={iconSize} />,
          key: ChatSettingsTabs.Prompt,
          label: t('agentTab.prompt'),
        },
        (!isInbox && {
          icon: <Icon icon={Handshake} size={iconSize} />,
          key: ChatSettingsTabs.Opening,
          label: t('agentTab.opening'),
        }) as MenuItemType,
        enableSelfLearning && {
          icon: <Icon icon={NotebookText} size={iconSize} />,
          key: ChatSettingsTabs.Rules,
          label: t('agentTab.rules'),
        },
        enableAgentSelfIteration && {
          icon: <Icon icon={Activity} size={iconSize} />,
          key: ChatSettingsTabs.SelfIteration,
          label: t('agentTab.selfIteration'),
        },
        {
          icon: <Icon icon={LinkIcon} size={iconSize} />,
          key: ChatSettingsTabs.Connector,
          label: t('agentTab.connector', 'Connectors'),
        },
      ].filter(Boolean) as MenuProps['items'],
    [t, isInbox, iconSize, enableAgentSelfIteration, enableSelfLearning],
  );

  return cateItems;
};
