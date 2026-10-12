'use client';

import type { WorkSummaryItem } from '@orvilo/types';
import { formatAbsoluteDate } from '@orvilo/utils/time';
import { cn } from 'cn';
import { PackageOpenIcon, TriangleAlertIcon } from 'lucide-react';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import SimpleEmpty from '@/components/SimpleEmpty';
import { Button } from '@/components/ui/button';
import AssigneeAvatar from '@/features/AgentTasks/features/AssigneeAvatar';
import { useAgentDisplayMeta } from '@/features/AgentTasks/shared/useAgentDisplayMeta';
import { useFetchAgentList } from '@/hooks/useFetchAgentList';
import { formatWorkVersionCost } from '@/utils/workVersionCost';

import type { WorkGalleryKey } from './const';
import { useWorkspaceWorksInfinite } from './hooks';
import WorkGallerySkeleton, { WorkGalleryCardsSkeleton } from './Skeleton';
import { useOpenWork } from './useOpenWork';
import WorkPreviewCard from './WorkPreviewCard';

const styles = {
  agentFilter: 'flex-none border border-transparent text-muted-foreground',
  agentFilterActive: 'border-border bg-selected text-foreground hover:bg-selected',
  cardList:
    'grid w-full grid-cols-[repeat(3,minmax(280px,1fr))] gap-4 [@media(width>=1600px)]:grid-cols-[repeat(4,minmax(280px,1fr))] [@media(width<=920px)]:grid-cols-[repeat(2,minmax(280px,1fr))] [@media(width<=620px)]:grid-cols-[minmax(0,1fr)]',
  container: 'h-full',
  emptyState: 'h-full min-h-80',
  filterBar:
    'flex-none overflow-x-auto overflow-y-hidden px-6 pbs-3 pbe-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
  groupCount: 'flex-none text-xs leading-5 text-foreground-tertiary',
  groupHeader: 'mbe-3 flex items-baseline gap-2.5',
  groupTitle: 'text-sm leading-5.5 font-semibold text-foreground',
  loadMoreError:
    'flex flex-wrap items-center justify-center gap-2 py-4 text-sm leading-5.5 text-muted-foreground',
  retry:
    'cursor-pointer border-border bg-card text-muted-foreground hover:border-foreground-tertiary hover:text-foreground',
  scroll: 'min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-6 pbs-2 pbe-6',
};

interface AgentFilterProps {
  active: boolean;
  agentId: string;
  onSelect: (agentId: string) => void;
}

const AgentFilter = memo<AgentFilterProps>(({ active, agentId, onSelect }) => {
  const agent = useAgentDisplayMeta(agentId);
  if (!agent) return null;

  return (
    <Button
      className={cn(styles.agentFilter, active && styles.agentFilterActive)}
      size="compact"
      variant="ghost"
      onClick={() => onSelect(agentId)}
    >
      <AssigneeAvatar agentId={agentId} size={20} />
      {agent.title}
    </Button>
  );
});

AgentFilter.displayName = 'AgentFilter';

interface WorkGalleryProps {
  galleryKey: WorkGalleryKey;
}

const WorkGallery = memo<WorkGalleryProps>(({ galleryKey }) => {
  const { t } = useTranslation('file');
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null);
  useFetchAgentList();

  const { items, error, hasMore, isLoadingInitial, isLoadingMore, loadMore, reload } =
    useWorkspaceWorksInfinite(galleryKey);

  const agentIds = useMemo(
    () => [...new Set(items.map((item) => item.originAgentId).filter(Boolean))] as string[],
    [items],
  );
  const filteredItems = useMemo(
    () => (activeAgentId ? items.filter((item) => item.originAgentId === activeAgentId) : items),
    [activeAgentId, items],
  );
  const groups = useMemo(() => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const dateKey = (date: Date) =>
      `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
    const todayKey = dateKey(today);
    const yesterdayKey = dateKey(yesterday);
    const byDate = new Map<string, { items: WorkSummaryItem[]; title: string }>();

    for (const item of filteredItems) {
      const date = new Date(item.updatedAt);
      const key = dateKey(date);
      const title =
        key === todayKey
          ? t('work.date.today')
          : key === yesterdayKey
            ? t('work.date.yesterday')
            : formatAbsoluteDate(date);
      const group = byDate.get(key);
      if (group) group.items.push(item);
      else byDate.set(key, { items: [item], title });
    }

    return [...byDate.entries()].map(([key, group]) => ({
      key,
      ...group,
      totalCost: formatWorkVersionCost(
        group.items.reduce((total, item) => total + (item.totalCost || 0), 0),
      ),
    }));
  }, [filteredItems, t]);

  const handleOpen = useOpenWork();

  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = sentinelRef.current;
    if (!element || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasMore && !isLoadingMore) loadMore();
      },
      { rootMargin: '240px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [hasMore, isLoadingMore, loadMore]);

  const renderBody = () => {
    if (error && items.length === 0)
      return (
        <div className={cn('flex flex-col items-center justify-center gap-3', styles.emptyState)}>
          <SimpleEmpty
            description={t('work.loadError')}
            icon={TriangleAlertIcon}
            title={t('work.loadErrorTitle')}
          />
          <Button
            className={styles.retry}
            size={'lg'}
            type={'button'}
            variant={'outline'}
            onClick={() => reload()}
          >
            {t('work.retry')}
          </Button>
        </div>
      );

    if (items.length === 0)
      return (
        <div className={cn('flex flex-col items-center justify-center', styles.emptyState)}>
          <SimpleEmpty
            description={t('work.empty.desc')}
            icon={PackageOpenIcon}
            title={t('work.empty.title')}
          />
        </div>
      );

    if (filteredItems.length === 0)
      return (
        <div className={cn('flex flex-col items-center justify-center', styles.emptyState)}>
          <SimpleEmpty description={t('work.agentEmpty.desc')} title={t('work.agentEmpty.title')} />
        </div>
      );

    return (
      <>
        <div className="flex flex-col gap-8">
          {groups.map((group) => (
            <section key={group.key}>
              <div className={styles.groupHeader}>
                <span className={styles.groupTitle}>{group.title}</span>
                <span className={styles.groupCount}>
                  {t('work.count', { count: group.items.length })}
                </span>
                {group.totalCost && (
                  <span className={styles.groupCount}>
                    {t('work.totalCost', { cost: group.totalCost })}
                  </span>
                )}
              </div>
              <div className={styles.cardList}>
                {group.items.map((item) => (
                  <WorkPreviewCard
                    item={item}
                    key={item.id}
                    onOpen={handleOpen}
                    onRemoved={reload}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
        <div aria-hidden className="h-px" ref={sentinelRef} />
        {isLoadingMore ? (
          <div className="mbs-3 flex flex-col">
            <WorkGalleryCardsSkeleton count={4} />
          </div>
        ) : error ? (
          <div className={styles.loadMoreError}>
            <span>{t('work.loadMoreError')}</span>
            <Button
              className={styles.retry}
              size={'lg'}
              type={'button'}
              variant={'outline'}
              onClick={() => reload()}
            >
              {t('work.retry')}
            </Button>
          </div>
        ) : null}
      </>
    );
  };

  return isLoadingInitial && items.length === 0 ? (
    <WorkGallerySkeleton />
  ) : (
    <div className={cn('flex flex-col', styles.container)}>
      {agentIds.length > 0 && (
        <div className={cn('flex flex-row items-center gap-1', styles.filterBar)}>
          <Button
            className={cn(styles.agentFilter, !activeAgentId && styles.agentFilterActive)}
            size="compact"
            variant="ghost"
            onClick={() => setActiveAgentId(null)}
          >
            {t('work.agentFilter.all')}
          </Button>
          {agentIds.map((agentId) => (
            <AgentFilter
              active={activeAgentId === agentId}
              agentId={agentId}
              key={agentId}
              onSelect={setActiveAgentId}
            />
          ))}
        </div>
      )}
      <div className={cn('flex flex-col', styles.scroll)}>{renderBody()}</div>
    </div>
  );
});

WorkGallery.displayName = 'WorkGallery';

export default WorkGallery;
