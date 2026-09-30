import { createStaticStyles, cssVar, cx } from 'antd-style';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import {
  BotMessageSquare,
  CheckCircle2Icon,
  ChevronDownIcon,
  HistoryIcon,
  MessageSquareIcon,
  SearchIcon,
  XCircleIcon,
  XIcon,
} from 'lucide-react';
import { createElement, memo, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';

import ActionIcon from '@/components/ActionIcon';
import AsyncError from '@/components/AsyncError';
import { DropdownMenu } from '@/components/ItemsMenu';
import TablePagination from '@/components/TablePagination';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import NavHeader from '@/features/NavHeader';
import WideScreenContainer from '@/features/WideScreenContainer';
import WorkspaceLink from '@/features/Workspace/WorkspaceLink';
import { useTaskStore } from '@/store/task';

import RunStatusBadge from './RunStatusBadge';
import {
  automationDetailPath,
  RUN_STATUS_FILTER_OPTIONS,
  RUN_STATUS_TO_TOPIC_STATUSES,
  runDuration,
  runTriggerLabel,
} from './shared';

dayjs.extend(relativeTime);

const PAGE_SIZE = 25;
const SEARCH_DEBOUNCE_MS = 400;

const styles = createStaticStyles(({ css, cssVar }) => ({
  headerRow: css`
    display: grid;
    grid-template-columns: minmax(0, 2fr) 90px 130px 120px 70px 40px;
    gap: 12px;
    align-items: center;

    padding-block: 6px;
    padding-inline: 8px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};

    font-size: 12px;
    font-weight: 500;
    color: ${cssVar.colorTextTertiary};
  `,
  row: css`
    cursor: pointer;

    display: grid;
    grid-template-columns: minmax(0, 2fr) 90px 130px 120px 70px 40px;
    gap: 12px;
    align-items: center;

    padding-block: 8px;
    padding-inline: 8px;
    border-radius: 8px;

    &:hover {
      background: ${cssVar.colorFillTertiary};
    }
  `,
  statCard: css`
    flex: 1;
    min-width: 140px;
  `,
}));

interface RunRow {
  agentId?: string | null;
  completedAt?: Date | string | null;
  createdAt?: Date | string | null;
  operationId?: string | null;
  sourceTaskIdentifier?: string | null;
  sourceTaskName?: string | null;
  status?: string | null;
  title?: string | null;
  topicId?: string | null;
  trigger?: string | null;
}

const StatCard = memo<{
  danger?: boolean;
  icon: typeof CheckCircle2Icon;
  label: string;
  value: number;
}>(({ danger, icon, label, value }) => (
  <div
    className={cx(styles.statCard, 'flex flex-col gap-2 p-4 border')}
    style={{ borderColor: cssVar.colorBorderSecondary, background: cssVar.colorBgContainer }}
  >
    <div className="flex items-center gap-2">
      {createElement(icon, { color: danger ? cssVar.colorError : cssVar.colorSuccess, size: 16 })}
      <div className="text-[12px] text-muted-foreground">{label}</div>
    </div>
    <div className="text-[22px] font-semibold">{value}</div>
  </div>
));

const AutomationRunsPage = memo(() => {
  const { t } = useTranslation('automation');
  const [searchParams, setSearchParams] = useSearchParams();
  const statusFilter =
    RUN_STATUS_FILTER_OPTIONS.find((status) => status === searchParams.get('status')) ?? '';
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const openTopicDrawer = useTaskStore((s) => s.openTopicDrawer);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, debouncedSearch]);

  const useFetchAutomationRuns = useTaskStore((s) => s.useFetchAutomationRuns);
  const { data, error, isLoading, mutate } = useFetchAutomationRuns({
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
    search: debouncedSearch || undefined,
    statuses: statusFilter ? RUN_STATUS_TO_TOPIC_STATUSES[statusFilter] : undefined,
  });

  const runs = (data?.data?.runs ?? []) as RunRow[];
  const stats = data?.data?.stats;
  const total = data?.data?.total ?? 0;

  const setStatusFilter = useCallback(
    (value: string) => {
      const next = new URLSearchParams(searchParams);
      if (value) next.set('status', value);
      else next.delete('status');
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const openRun = useCallback(
    (run: RunRow) => {
      if (!run.topicId) return;
      openTopicDrawer(run.topicId, {
        agentId: run.agentId ?? undefined,
        title: run.title ?? run.sourceTaskName ?? undefined,
      });
    },
    [openTopicDrawer],
  );

  return (
    <div className="flex flex-col flex-1 h-full">
      <NavHeader
        styles={{ left: { paddingLeft: 8 } }}
        left={
          <div className="flex items-center gap-2">
            <HistoryIcon color={cssVar.colorTextTertiary} size={16} />
            <div className="text-[15px] font-semibold">{t('runs.title')}</div>
          </div>
        }
        right={
          <div className="flex items-center gap-1.5">
            <div className="relative" style={{ width: 220 }}>
              <SearchIcon
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                size={14}
              />
              <Input
                className="h-7 pl-7"
                placeholder={t('run_history.search_placeholder')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button
                  aria-label={t('run_history.search_placeholder')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                  onClick={() => setSearch('')}
                >
                  <XIcon size={12} />
                </button>
              )}
            </div>
            <DropdownMenu
              items={[
                {
                  key: '',
                  label: t('overview.all_statuses'),
                  onClick: () => setStatusFilter(''),
                },
                ...RUN_STATUS_FILTER_OPTIONS.map((value) => ({
                  key: value,
                  label: t(`run_status.${value}`),
                  onClick: () => setStatusFilter(value),
                })),
              ]}
            >
              <Button size="sm">
                {statusFilter ? t(`run_status.${statusFilter}`) : t('overview.all_statuses')}
                <ChevronDownIcon data-icon="inline-end" />
              </Button>
            </DropdownMenu>
          </div>
        }
      />
      <div className="flex flex-col flex-1" style={{ minHeight: 0, overflowY: 'auto' }}>
        <WideScreenContainer fullWidth style={{ paddingBlock: 16, paddingInline: 24 }}>
          {stats && (
            <div className="flex gap-3" style={{ flexWrap: 'wrap', marginBlockEnd: 16 }}>
              <StatCard
                icon={CheckCircle2Icon}
                label={t('runs.stat.completed_24h')}
                value={stats.completed24h}
              />
              <StatCard
                icon={CheckCircle2Icon}
                label={t('runs.stat.completed_7d')}
                value={stats.completed7d}
              />
              <StatCard
                danger
                icon={XCircleIcon}
                label={t('runs.stat.failed_24h')}
                value={stats.failed24h}
              />
              <StatCard
                danger
                icon={XCircleIcon}
                label={t('runs.stat.failed_7d')}
                value={stats.failed7d}
              />
            </div>
          )}
          {error ? (
            <AsyncError error={error} onRetry={() => void mutate()} />
          ) : isLoading && runs.length === 0 ? (
            <div className="flex flex-col p-6">
              <div className="text-muted-foreground">{t('runs.title')}…</div>
            </div>
          ) : runs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="flex flex-col items-center gap-2">
                <BotMessageSquare color={cssVar.colorTextQuaternary} size={32} />
                <div className="text-muted-foreground">{t('run_history.no_matches')}</div>
              </div>
            </div>
          ) : (
            <>
              <div className={styles.headerRow}>
                <span>{t('run_history.automation')}</span>
                <span>{t('run_history.trigger')}</span>
                <span>{t('run_history.triggered')}</span>
                <span>{t('run_history.status')}</span>
                <span>{t('run_history.duration')}</span>
                <span />
              </div>
              {runs.map((run) => (
                <div
                  className={styles.row}
                  key={run.topicId ?? run.operationId}
                  onClick={() => openRun(run)}
                >
                  {run.sourceTaskIdentifier ? (
                    <div style={{ minWidth: 0 }} onClick={(e) => e.stopPropagation()}>
                      <WorkspaceLink to={automationDetailPath(run.sourceTaskIdentifier)}>
                        <div className="truncate min-w-0 font-medium" style={{ color: 'inherit' }}>
                          {run.sourceTaskName || run.sourceTaskIdentifier}
                        </div>
                      </WorkspaceLink>
                    </div>
                  ) : (
                    <div className="truncate min-w-0 text-[13px] font-medium">
                      {run.sourceTaskName ?? run.title ?? '—'}
                    </div>
                  )}
                  <div className="text-[12px] text-muted-foreground">
                    {t(`run_source.${runTriggerLabel(run.trigger)}`)}
                  </div>
                  <div
                    className="truncate min-w-0 text-[12px] text-muted-foreground"
                    title={run.createdAt ? dayjs(run.createdAt).format('LLL') : undefined}
                  >
                    {run.createdAt ? dayjs(run.createdAt).fromNow() : '—'}
                  </div>
                  <RunStatusBadge status={run.status} />
                  <div className="text-[12px] text-muted-foreground">
                    {runDuration(
                      run.createdAt ? String(run.createdAt) : null,
                      run.completedAt ? String(run.completedAt) : null,
                    )}
                  </div>
                  <ActionIcon
                    disabled={!run.topicId}
                    icon={MessageSquareIcon}
                    size={'small'}
                    title={t('run.open_conversation')}
                    onClick={(e) => {
                      e.stopPropagation();
                      openRun(run);
                    }}
                  />
                </div>
              ))}
              {total > PAGE_SIZE && (
                <div className="flex justify-center py-4">
                  <TablePagination
                    current={page}
                    pageSize={PAGE_SIZE}
                    pageSizeOptions={[PAGE_SIZE]}
                    total={total}
                    onChange={(next) => setPage(next)}
                  />
                </div>
              )}
            </>
          )}
        </WideScreenContainer>
      </div>
    </div>
  );
});

export default AutomationRunsPage;
