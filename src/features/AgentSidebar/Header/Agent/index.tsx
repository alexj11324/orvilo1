'use client';

import type { PropsWithChildren } from 'react';
import React, { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { SkeletonItem } from '@/features/NavPanel/components/SkeletonList';
import { useAgentStore } from '@/store/agent';
import { agentSelectors, builtinAgentSelectors } from '@/store/agent/selectors';

/**
 * Static context label for the topic sidebar: the agent's display name without
 * the switcher affordance (topic list only — agent switching lives in the
 * composer and the home agent list).
 */
const Agent = memo<PropsWithChildren>(() => {
  const { t } = useTranslation(['chat', 'common']);

  const [isLoading, isInbox, title] = useAgentStore((s) => [
    agentSelectors.isAgentConfigLoading(s),
    builtinAgentSelectors.isInboxAgent(s),
    agentSelectors.currentAgentDisplayName(s),
  ]);

  const displayTitle = isInbox
    ? title || 'Orvilo AI'
    : title || t('defaultSession', { ns: 'common' });

  if (isLoading) return <SkeletonItem height={16} padding={0} />;

  return <span className="truncate">{displayTitle}</span>;
});

export default Agent;
