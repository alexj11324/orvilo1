'use client';

import isEqual from 'fast-deep-equal';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { VList } from 'virtua';

import AsyncError from '@/components/AsyncError';
import AgentSelectionEmpty from '@/features/AgentSelectionEmpty';
import SkeletonList from '@/features/NavPanel/components/SkeletonList';
import { useHomeStore } from '@/store/home';
import { homeAgentListSelectors } from '@/store/home/selectors';

import GroupItem from '../List/AgentGroupItem';
import AgentItem from '../List/AgentItem';
import { useKeepSidebarListed } from '../List/useAgentList';
import { resolveAllAgentsContentState } from './contentState';

interface ContentProps {
  open: boolean;
  searchKeyword: string;
}

const Content = memo<ContentProps>(({ searchKeyword }) => {
  const { t } = useTranslation('common');
  // Use server-side search if there's a keyword
  const trimmedKeyword = searchKeyword.trim();
  const isSearching = trimmedKeyword.length > 0;

  // Search agents using homeStore
  const [closeAllAgentsDrawer, useSearchAgents] = useHomeStore((s) => [
    s.closeAllAgentsDrawer,
    s.useSearchAgents,
  ]);
  const {
    data: searchResults,
    error: searchError,
    isLoading: isSearchLoading,
    isValidating: isSearchValidating,
    mutate: retrySearch,
  } = useSearchAgents(isSearching ? trimmedKeyword : undefined);

  // Get all agents from homeStore (ungrouped agents for default view)
  const allUngroupedAgents = useHomeStore(homeAgentListSelectors.ungroupedAgents, isEqual);

  // The drawer is sidebar overflow, so it honors the caller's "removed from
  // my sidebar" list like every sidebar section — items hidden there are
  // findable on the /agents View All page instead.
  const keep = useKeepSidebarListed();

  // Filter and display - searchResults already returns SidebarAgentItem[]
  const displayItems = keep(isSearching ? searchResults || [] : allUngroupedAgents);

  const count = displayItems.length;

  // Close on navigation because the Home layout stays mounted offscreen across route changes.
  const handleNavigate = closeAllAgentsDrawer;

  const state = resolveAllAgentsContentState({
    count,
    hasSearchResults: !!searchResults,
    isSearchLoading,
    isSearching,
    searchError,
  });

  if (state === 'error') {
    return (
      <AsyncError
        error={searchError}
        retrying={isSearchValidating}
        title={t('navPanel.searchAgentFailed')}
        variant={'inline'}
        onRetry={() => void retrySearch()}
      />
    );
  }

  // Show loading skeleton when searching
  if (state === 'loading') {
    return (
      <div className="flex flex-col gap-[1px] py-[1px] px-[4px]">
        <SkeletonList rows={5} />
      </div>
    );
  }

  // Show empty state when no agents
  if (state === 'empty') {
    return <AgentSelectionEmpty search={isSearching} />;
  }

  return (
    <VList
      bufferSize={typeof window !== 'undefined' ? window.innerHeight : 0}
      style={{ height: '100%' }}
    >
      {displayItems.map((item) => (
        <div className="flex flex-col py-[1px] px-[4px]" key={item.id}>
          {item.type === 'group' ? (
            <GroupItem item={item} onNavigate={handleNavigate} />
          ) : (
            <AgentItem item={item} onNavigate={handleNavigate} />
          )}
        </div>
      ))}
    </VList>
  );
});

Content.displayName = 'AllAgentsDrawerContent';

export default Content;
