'use client';

import { getOrviloSkillProviderById } from '@orvilo/const';
import { type ReactNode } from 'react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useToolStore } from '@/store/tool';
import { orviloSkillStoreSelectors } from '@/store/tool/selectors';
import { OrviloSkillStatus } from '@/store/tool/slices/orviloSkillStore/types';

import { type DetailContextValue } from './DetailContext';
import { DetailContext } from './DetailContext';

interface OrviloDetailProviderProps {
  children: ReactNode;
  identifier: string;
}

export const OrviloDetailProvider = ({ children, identifier }: OrviloDetailProviderProps) => {
  const { t } = useTranslation(['setting']);

  const config = useMemo(() => getOrviloSkillProviderById(identifier), [identifier]);

  const orviloSkillServers = useToolStore(orviloSkillStoreSelectors.getServers);

  const serverState = useMemo(
    () => orviloSkillServers.find((s) => s.identifier === identifier),
    [identifier, orviloSkillServers],
  );

  const isConnected = useMemo(
    () => serverState?.status === OrviloSkillStatus.CONNECTED,
    [serverState],
  );

  const useFetchProviderTools = useToolStore((s) => s.useFetchProviderTools);
  const { data: tools = [], isLoading: toolsLoading } = useFetchProviderTools(identifier);

  if (!config) return null;

  const { author, authorUrl, description, icon, readme, label } = config;

  const localizedDescription = t(`tools.orviloSkill.providers.${identifier}.description`, {
    defaultValue: description,
  });
  const localizedReadme = t(`tools.orviloSkill.providers.${identifier}.readme`, {
    defaultValue: readme,
  });

  const value: DetailContextValue = {
    author,
    authorUrl,
    config,
    description,
    icon,
    identifier,
    isConnected,
    label,
    localizedDescription,
    localizedReadme,
    readme,
    tools,
    toolsLoading,
  };

  return <DetailContext value={value}>{children}</DetailContext>;
};
