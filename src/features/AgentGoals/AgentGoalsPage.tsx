'use client';

import type { GoalStatus } from '@orvilo/const/goal';
import { LayoutGridIcon, ListIcon, RefreshCwIcon } from 'lucide-react';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import GoalSkeleton from '@/components/Skeleton/Goal';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import AgentBreadcrumb from '@/features/AgentBreadcrumb';
import NavHeader from '@/features/NavHeader';
import WideScreenContainer from '@/features/WideScreenContainer';
import { goalSelectors, useGoalStore } from '@/store/goal';

import { GoalCardItem } from './GoalCardItem';
import GoalEmptyState from './GoalEmptyState';
import { GoalListItem } from './GoalListItem';

const styles = {
  countBadge:
    '[padding-block:1px] [padding-inline:7px] rounded-[99px] text-xs tabular-nums leading-[18px] text-muted-foreground bg-accent',
  overview: '[padding-block:6px_18px]',
  list: 'grid grid-cols-2 gap-3 [@media(width<=900px)]:grid-cols-1',
  listRows: 'flex flex-col [border-block:1px_solid_var(--sidebar-border)]',
  metric:
    'min-w-[88px] ps-4 [border-inline-start:1px_solid_var(--sidebar-border)] first:ps-0 first:[border-inline-start:0]',
};

/** Goals whose loop has stopped for good — hidden by the default "open" filter. */
const TERMINAL_GOAL_STATUSES = new Set<GoalStatus>(['achieved', 'failed', 'canceled']);

interface AgentGoalsPageProps {
  agentId?: string;
  projectId?: string;
}

const AgentGoalsPage = memo<AgentGoalsPageProps>(({ agentId, projectId }) => {
  const { t } = useTranslation('chat');
  const scopeId = projectId ? `project:${projectId}` : agentId!;
  const useFetchGoals = useGoalStore((s) => s.useFetchGoals);
  const refreshGoals = useGoalStore((s) => s.refreshGoals);
  const goals = useGoalStore(goalSelectors.goalList(scopeId));
  const isInitialized = useGoalStore(goalSelectors.isGoalListInitialized(scopeId));
  const filter = useGoalStore((s) => s.goalListFilter);
  const viewMode = useGoalStore((s) => s.goalViewMode);
  const visibleLimit = useGoalStore((s) => s.goalListVisibleLimit);
  const setFilter = useGoalStore((s) => s.setGoalListFilter);
  const setViewMode = useGoalStore((s) => s.setGoalViewMode);
  const loadMoreGoals = useGoalStore((s) => s.loadMoreGoals);
  const { error, isLoading } = useFetchGoals(agentId, projectId);
  const summary = useMemo(() => {
    const delivered = goals.filter(({ goal }) => goal.status === 'review').length;

    return { delivered, pursuing: goals.length - delivered, total: goals.length };
  }, [goals]);
  const filteredGoals = useMemo(() => {
    if (filter === 'all') return goals;

    return goals.filter(({ goal }) => !TERMINAL_GOAL_STATUSES.has(goal.status));
  }, [filter, goals]);
  const visibleGoalCount = filteredGoals.length;
  const GoalItem = viewMode === 'list' ? GoalListItem : GoalCardItem;

  return (
    <div className="flex flex-col flex-1 h-full">
      <NavHeader
        left={
          agentId ? (
            <AgentBreadcrumb agentId={agentId} title={t('goalList.title')} />
          ) : (
            <div className="font-semibold">{t('goalList.title')}</div>
          )
        }
      />
      <WideScreenContainer wrapperStyle={{ flex: 1, gap: 16, paddingBlock: 16, overflowY: 'auto' }}>
        {isLoading && !isInitialized ? (
          <GoalSkeleton chrome={'body'} />
        ) : error ? (
          <div className="flex flex-col rounded-md border border-border" style={{ padding: 32 }}>
            <div className="flex flex-col items-center gap-3">
              <div className="font-semibold">{t('goalList.loadError')}</div>
              <div className="text-[13px] text-muted-foreground">
                {t('goalList.loadErrorDescription')}
              </div>
              <Button size="sm" onClick={() => void refreshGoals(scopeId)}>
                <RefreshCwIcon data-icon="inline-start" />
                {t('goalList.retry')}
              </Button>
            </div>
          </div>
        ) : goals.length === 0 ? (
          <GoalEmptyState />
        ) : (
          <>
            <div className={`flex flex-col ${styles.overview}`}>
              <div className="flex items-center gap-5 justify-between flex-wrap">
                <div className="flex flex-col gap-[3px]">
                  <div className="text-[20px] font-semibold">{t('goalPage.title')}</div>
                  <div className="text-muted-foreground">{t('goalPage.description')}</div>
                </div>
                <div className="flex gap-5">
                  <div className={`flex flex-col gap-0.5 ${styles.metric}`}>
                    <div className="text-[20px] font-semibold">{summary.total}</div>
                    <div className="text-[12px] text-muted-foreground">
                      {t('goalPage.metrics.total')}
                    </div>
                  </div>
                  <div className={`flex flex-col gap-0.5 ${styles.metric}`}>
                    <div className="text-[20px] font-semibold">{summary.pursuing}</div>
                    <div className="text-[12px] text-muted-foreground">
                      {t('goalPage.metrics.pursuing')}
                    </div>
                  </div>
                  <div className={`flex flex-col gap-0.5 ${styles.metric}`}>
                    <div className="text-[20px] font-semibold">{summary.delivered}</div>
                    <div className="text-[12px] text-muted-foreground">
                      {t('goalPage.metrics.delivered')}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="text-[16px] font-semibold">{t('goalPage.listTitle')}</div>
                  <span className={styles.countBadge}>{visibleGoalCount}</span>
                </div>
                <div className="flex items-center gap-2">
                  <ToggleGroup
                    size="sm"
                    value={[filter]}
                    onValueChange={(value) => {
                      if (value.length > 0) setFilter(value[0] as 'active' | 'all');
                    }}
                  >
                    <ToggleGroupItem value="active">{t('goalPage.filter.open')}</ToggleGroupItem>
                    <ToggleGroupItem value="all">{t('goalPage.filter.all')}</ToggleGroupItem>
                  </ToggleGroup>
                  <ActionIcon
                    icon={ListIcon}
                    size={'small'}
                    style={{ alignSelf: 'center' }}
                    title={t('goalPage.view.list')}
                    variant={viewMode === 'list' ? 'filled' : 'borderless'}
                    onClick={() => setViewMode('list')}
                  />
                  <ActionIcon
                    icon={LayoutGridIcon}
                    size={'small'}
                    style={{ alignSelf: 'center' }}
                    title={t('goalPage.view.card')}
                    variant={viewMode === 'card' ? 'filled' : 'borderless'}
                    onClick={() => setViewMode('card')}
                  />
                </div>
              </div>
              <div className={viewMode === 'card' ? styles.list : styles.listRows}>
                {filteredGoals.length === 0 ? (
                  <div
                    className="flex flex-col rounded-md border border-border"
                    style={{ padding: 32 }}
                  >
                    <Empty>
                      <EmptyHeader>
                        <EmptyTitle>{t('goalPage.filteredEmptyTitle')}</EmptyTitle>
                        <EmptyDescription>
                          {t('goalPage.filteredEmptyDescription')}
                        </EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  </div>
                ) : (
                  filteredGoals
                    .slice(0, visibleLimit)
                    .map((item) => (
                      <GoalItem goal={item} key={item.goal.id} projectId={projectId} />
                    ))
                )}
              </div>
              {visibleLimit < filteredGoals.length && (
                <div className="flex flex-col items-center" style={{ paddingBlock: 8 }}>
                  <Button size="sm" onClick={loadMoreGoals}>
                    {t('goalPage.loadMore')}
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
      </WideScreenContainer>
    </div>
  );
});

AgentGoalsPage.displayName = 'AgentGoalsPage';

export default AgentGoalsPage;
