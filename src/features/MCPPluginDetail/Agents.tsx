'use client';

import { InboxIcon, ServerCrash } from 'lucide-react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { VirtuosoGrid } from 'react-virtuoso';

import { ArticleSkeleton } from '@/components/Skeleton';
import { useClientDataSWR } from '@/libs/swr';
import { discoverKeys } from '@/libs/swr/keys';
import { discoverService } from '@/services/discover';
import { type DiscoverAssistantItem } from '@/types/discover';

import AgentItem from './AgentItem';
import { useDetailContext } from './DetailProvider';
import { agentListStyles as styles } from './style';
import VirtuosoLoading from './VirtuosoLoading';

const PAGE_SIZE = 12;

interface AgentsProps {
  inModal?: boolean;
}

const Agents = memo<AgentsProps>(({ inModal }) => {
  const { t } = useTranslation('discover');
  const { identifier } = useDetailContext();

  // Local state for pagination
  const [items, setItems] = useState<DiscoverAssistantItem[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [isInitialized, setIsInitialized] = useState(false);
  const prevPageRef = useRef(currentPage);

  // SWR fetch data (lazy loading - only requests when component mounts)
  const { data, isLoading, error } = useClientDataSWR(
    identifier ? discoverKeys.mcpAgents(identifier, currentPage) : null,
    () =>
      discoverService.getAgentsByPlugin({
        page: currentPage,
        pageSize: PAGE_SIZE,
        pluginId: identifier!,
      }),
  );

  // Data accumulation logic
  useEffect(() => {
    if (data) {
      if (currentPage === 1) {
        setItems(data.items);
      } else if (currentPage > prevPageRef.current) {
        setItems((prev) => [...prev, ...data.items]);
      }
      setTotalCount(data.totalCount);
      setIsInitialized(true);
      prevPageRef.current = currentPage;
    }
  }, [data, currentPage]);

  const hasMore = items.length < totalCount;

  const loadMore = useCallback(() => {
    if (!isLoading && hasMore) {
      setCurrentPage((prev) => prev + 1);
    }
  }, [isLoading, hasMore]);

  // Initial loading state
  if (!isInitialized && isLoading) {
    return (
      <div
        className="grid gap-3"
        style={{
          gridTemplateColumns:
            'repeat(auto-fill, minmax(max(240px, calc((100% - 12px) / 2)), 1fr))',
          width: '100%',
        }}
      >
        {Array.from({ length: 4 }).map((_, index) => (
          <ArticleSkeleton avatar={40} key={index} rows={1} />
        ))}
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-10">
        <ServerCrash color={'var(--ant-color-text-description)'} size={80} />
        <span className="text-muted-foreground">{t('mcp.details.agents.networkError')}</span>
      </div>
    );
  }

  // Empty state
  if (isInitialized && items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-10">
        <InboxIcon color={'var(--ant-color-text-description)'} size={80} />
        <span className="text-muted-foreground">{t('mcp.details.agents.empty')}</span>
      </div>
    );
  }

  // Use VirtuosoGrid for rendering
  return (
    <VirtuosoGrid
      data={items}
      endReached={loadMore}
      increaseViewportBy={typeof window !== 'undefined' ? window.innerHeight : 0}
      itemClassName={styles.item}
      itemContent={(_, item) => <AgentItem key={item.identifier} {...item} />}
      listClassName={styles.list}
      overscan={24}
      style={inModal ? { height: '50vh', width: '100%' } : { width: '100%' }}
      useWindowScroll={!inModal}
      components={{
        Footer: isLoading ? VirtuosoLoading : () => <div style={{ height: 16 }} />,
      }}
    />
  );
});

export default Agents;
