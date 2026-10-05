'use client';

import { type PropsWithChildren } from 'react';
import React, { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { SkeletonItem } from '@/features/NavPanel/components/SkeletonList';
import { useActiveRouteParams } from '@/hooks/useActiveRouteParams';
import { useAgentGroupStore } from '@/store/agentGroup';
import { agentGroupSelectors } from '@/store/agentGroup/selectors';

/**
 * Static context label for the group topic sidebar: the group's title without
 * the switcher affordance (topic list only — group switching lives in the home
 * sidebar).
 */
const Agent = memo<PropsWithChildren>(() => {
  const { t } = useTranslation(['chat', 'common']);

  const { gid } = useActiveRouteParams<{ gid: string }>();
  const [isGroupsInit, groupMeta] = useAgentGroupStore((s) => [
    agentGroupSelectors.isGroupsInit(s),
    agentGroupSelectors.getGroupMeta(gid ?? '')(s),
  ]);

  const displayTitle = groupMeta?.title || t('untitledGroup', { ns: 'chat' });

  if (isGroupsInit) return <SkeletonItem height={16} padding={0} />;

  return <span className="truncate">{displayTitle}</span>;
});

export default Agent;
