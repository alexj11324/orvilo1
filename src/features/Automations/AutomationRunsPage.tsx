import { Block, Center, Flexbox, Icon, Input } from '@lobehub/ui';
import { ActionIcon, Button, DropdownMenu, Text } from '@lobehub/ui/base-ui';
import { Pagination } from 'antd';
import { createStaticStyles, cssVar } from 'antd-style';
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
} from 'lucide-react';
import { memo, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';

import AsyncError from '@/components/AsyncError';
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
  <Block className={styles.statCard} gap={8} padding={16} variant={'outlined'}>
    <Flexbox horizontal align={'center'} gap={8}>
      <Icon color={danger ? cssVar.colorError : cssVar.colorSuccess} icon={icon} size={16} />
      <Text fontSize={12} type={'secondary'}>
        {label}
      </Text>
    </Flexbox>
    <Text fontSize={22} weight={600}>
      {value}
    </Text>
  </Block>
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
    <Flexbox flex={1} height={'100%'}>
      <NavHeader
        styles={{ left: { paddingLeft: 8 } }}
        left={
          <Flexbox horizontal align={'center'} gap={8}>
            <Icon color={cssVar.colorTextTertiary} icon={HistoryIcon} size={16} />
            <Text fontSize={15} weight={600}>
              {t('runs.title')}
            </Text>
          </Flexbox>
        }
        right={
          <Flexbox horizontal align={'center'} gap={6}>
            <Input
              allowClear
              placeholder={t('run_history.search_placeholder')}
              prefix={<Icon icon={SearchIcon} size={14} />}
              size={'small'}
              style={{ width: 220 }}
              value={search}
              variant={'filled'}
              onChange={(e) => setSearch(e.target.value)}
            />
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
              <Button icon={ChevronDownIcon} iconPosition={'end'} size={'small'}>
                {statusFilter ? t(`run_status.${statusFilter}`) : t('overview.all_statuses')}
              </Button>
            </DropdownMenu>
          </Flexbox>
        }
      />
      <Flexbox flex={1} style={{ minHeight: 0, overflowY: 'auto' }}>
        <WideScreenContainer fullWidth paddingBlock={16} paddingInline={24}>
          {stats && (
            <Flexbox horizontal gap={12} style={{ marginBlockEnd: 16 }} wrap={'wrap'}>
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
            </Flexbox>
          )}
          {error ? (
            <AsyncError error={error} onRetry={() => void mutate()} />
          ) : isLoading && runs.length === 0 ? (
            <Flexbox padding={24}>
              <Text type={'secondary'}>{t('runs.title')}…</Text>
            </Flexbox>
          ) : runs.length === 0 ? (
            <Center paddingBlock={48}>
              <Flexbox align={'center'} gap={8}>
                <Icon color={cssVar.colorTextQuaternary} icon={BotMessageSquare} size={32} />
                <Text type={'secondary'}>{t('run_history.no_matches')}</Text>
              </Flexbox>
            </Center>
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
                        <Text ellipsis color={'inherit'} weight={500}>
                          {run.sourceTaskName || run.sourceTaskIdentifier}
                        </Text>
                      </WorkspaceLink>
                    </div>
                  ) : (
                    <Text ellipsis fontSize={13} weight={500}>
                      {run.sourceTaskName ?? run.title ?? '—'}
                    </Text>
                  )}
                  <Text fontSize={12} type={'secondary'}>
                    {t(`run_source.${runTriggerLabel(run.trigger)}`)}
                  </Text>
                  <Text
                    ellipsis
                    fontSize={12}
                    title={run.createdAt ? dayjs(run.createdAt).format('LLL') : undefined}
                    type={'secondary'}
                  >
                    {run.createdAt ? dayjs(run.createdAt).fromNow() : '—'}
                  </Text>
                  <RunStatusBadge status={run.status} />
                  <Text fontSize={12} type={'secondary'}>
                    {runDuration(
                      run.createdAt ? String(run.createdAt) : null,
                      run.completedAt ? String(run.completedAt) : null,
                    )}
                  </Text>
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
                <Flexbox horizontal justify={'center'} paddingBlock={16}>
                  <Pagination
                    current={page}
                    pageSize={PAGE_SIZE}
                    showSizeChanger={false}
                    total={total}
                    onChange={setPage}
                  />
                </Flexbox>
              )}
            </>
          )}
        </WideScreenContainer>
      </Flexbox>
    </Flexbox>
  );
});

export default AutomationRunsPage;
