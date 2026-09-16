import { Center, Flexbox, Icon, Input, Tooltip } from '@lobehub/ui';
import { ActionIcon, Button, Checkbox, DropdownMenu, Text, toast } from '@lobehub/ui/base-ui';
import type { TaskListItem } from '@orvilo/types';
import { Pagination } from 'antd';
import { createStaticStyles } from 'antd-style';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import {
  ChevronDownIcon,
  HistoryIcon,
  MoreHorizontalIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
} from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';

import AsyncError from '@/components/AsyncError';
import NavHeader from '@/features/NavHeader';
import WideScreenContainer from '@/features/WideScreenContainer';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import WorkspaceLink from '@/features/Workspace/WorkspaceLink';
import { usePermission } from '@/hooks/usePermission';
import { useTaskStore } from '@/store/task';

import AssigneeUserAvatar from '../AgentTasks/features/AssigneeUserAvatar';
import { useUserDisplayMeta } from '../AgentTasks/shared/useUserDisplayMeta';
import AutomationStatusBadge from './AutomationStatusBadge';
import AutomationTemplateGallery from './AutomationTemplateGallery';
import {
  automationDetailPath,
  automationNextRun,
  type AutomationStatus,
  automationStatusesFor,
  automationStatusOf,
  automationTriggerSummary,
} from './shared';
import { useAutomationActions } from './useAutomationActions';

dayjs.extend(relativeTime);

const PAGE_SIZE = 25;

const styles = createStaticStyles(({ css, cssVar }) => ({
  batchBar: css`
    position: sticky;
    inset-block-end: 16px;

    display: flex;
    gap: 8px;
    align-items: center;

    width: fit-content;
    margin-inline: auto;
    padding-block: 8px;
    padding-inline: 16px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 12px;

    background: ${cssVar.colorBgElevated};
    box-shadow: ${cssVar.boxShadowSecondary};
  `,
  headerRow: css`
    display: grid;
    grid-template-columns: 28px minmax(0, 2fr) 130px 110px minmax(0, 1.4fr) 110px 40px;
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
    grid-template-columns: 28px minmax(0, 2fr) 130px 110px minmax(0, 1.4fr) 110px 40px;
    gap: 12px;
    align-items: center;

    padding-block: 8px;
    padding-inline: 8px;
    border-radius: 8px;

    &:hover {
      background: ${cssVar.colorFillTertiary};
    }
  `,
  titleCell: css`
    display: flex;
    gap: 8px;
    align-items: center;
    min-width: 0;
  `,
  titleText: css`
    overflow: hidden;

    font-size: 13px;
    font-weight: 500;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
}));

type AutomationScope = 'all' | 'created';
type StatusFilter = 'all' | AutomationStatus;

const resolveScope = (params: URLSearchParams): AutomationScope =>
  params.get('scope') === 'created' ? 'created' : 'all';

const resolveStatusFilter = (params: URLSearchParams): StatusFilter => {
  const value = params.get('status');
  return value === 'active' || value === 'paused' ? value : 'all';
};

const CreatedByCell = memo<{ userId: string }>(({ userId }) => {
  const meta = useUserDisplayMeta(userId);
  return (
    <Flexbox horizontal align={'center'} gap={6} style={{ minWidth: 0 }}>
      <AssigneeUserAvatar size={16} userId={userId} />
      <Text ellipsis fontSize={12} type={'secondary'}>
        {meta?.title ?? ''}
      </Text>
    </Flexbox>
  );
});

interface AutomationRowProps {
  checked: boolean;
  onCheckedChange: (identifier: string, checked: boolean) => void;
  onOpen: (identifier: string) => void;
  task: TaskListItem;
}

const AutomationRow = memo<AutomationRowProps>(({ checked, onCheckedChange, onOpen, task }) => {
  const { t } = useTranslation('automation');
  const { pause, remove, resume, runNow } = useAutomationActions();
  const { allowed: canEdit } = usePermission('create_content');
  const status = automationStatusOf(task.status);
  const nextRun = automationNextRun(task);

  return (
    <div className={styles.row} onClick={() => onOpen(task.identifier)}>
      <div onClick={(e) => e.stopPropagation()}>
        <Checkbox checked={checked} onChange={(next) => onCheckedChange(task.identifier, next)} />
      </div>
      <div className={styles.titleCell}>
        <span className={styles.titleText}>{task.name || task.identifier}</span>
      </div>
      <CreatedByCell userId={task.createdByUserId} />
      <AutomationStatusBadge status={status} />
      <Text ellipsis fontSize={12} type={'secondary'}>
        {automationTriggerSummary(task, t)}
      </Text>
      <Text ellipsis fontSize={12} type={'secondary'}>
        {nextRun ? dayjs(nextRun.toDate()).fromNow() : '—'}
      </Text>
      <div onClick={(e) => e.stopPropagation()}>
        <DropdownMenu
          items={[
            {
              icon: <Icon icon={PlayIcon} />,
              key: 'run',
              label: t('detail.run_now'),
              onClick: () =>
                runNow(task).then(
                  () => toast.success(t('detail.toast_triggered')),
                  () => toast.error(t('detail.toast_trigger_failed')),
                ),
            },
            {
              icon: <Icon icon={status === 'paused' ? PlayIcon : PauseIcon} />,
              key: 'toggle',
              label: t(status === 'paused' ? 'actions.resume' : 'actions.pause'),
              onClick: () =>
                status === 'paused' ? resume(task.identifier) : pause(task.identifier),
            },
            { type: 'divider' },
            {
              danger: true,
              icon: <Icon icon={Trash2Icon} />,
              key: 'delete',
              label: t('actions.delete'),
              onClick: () => remove(task.identifier),
            },
          ]}
        >
          <ActionIcon
            disabled={!canEdit}
            icon={MoreHorizontalIcon}
            size={'small'}
            title={t('detail.more_actions')}
          />
        </DropdownMenu>
      </div>
    </div>
  );
});

const AutomationsPage = memo(() => {
  const { t } = useTranslation('automation');
  const navigate = useWorkspaceAwareNavigate();
  const { allowed: canCreate, reason } = usePermission('create_content');
  const [searchParams, setSearchParams] = useSearchParams();
  const scope = resolveScope(searchParams);
  const statusFilter = resolveStatusFilter(searchParams);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const { pause, remove, resume } = useAutomationActions();

  const useFetchAutomationList = useTaskStore((s) => s.useFetchAutomationList);
  const refreshTaskList = useTaskStore((s) => s.refreshTaskList);
  const { data, error, isLoading, mutate } = useFetchAutomationList({
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
    scope,
    statuses: automationStatusesFor(statusFilter),
  });

  const tasks = data?.data ?? [];
  const total = data?.total ?? 0;
  const hasSettled = data !== undefined;

  const query = search.trim().toLowerCase();
  const visibleTasks = useMemo(
    () =>
      query
        ? tasks.filter((task) => (task.name ?? task.identifier).toLowerCase().includes(query))
        : tasks,
    [tasks, query],
  );

  // Drop selections that scrolled out of the current result set.
  useEffect(() => {
    setSelected((prev) => {
      const ids = new Set(visibleTasks.map((task) => task.identifier));
      const next = new Set([...prev].filter((id) => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [visibleTasks]);

  useEffect(() => {
    setPage(1);
    setSelected(new Set());
  }, [scope, statusFilter]);

  const updateParams = useCallback(
    (mutator: (next: URLSearchParams) => void) => {
      const next = new URLSearchParams(searchParams);
      mutator(next);
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const setScope = useCallback(
    (value: string) =>
      updateParams((next) =>
        value === 'created' ? next.set('scope', 'created') : next.delete('scope'),
      ),
    [updateParams],
  );

  const setStatusFilter = useCallback(
    (value: StatusFilter) =>
      updateParams((next) => (value === 'all' ? next.delete('status') : next.set('status', value))),
    [updateParams],
  );

  const allChecked = visibleTasks.length > 0 && selected.size === visibleTasks.length;
  const handleCheckedChange = useCallback((identifier: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(identifier);
      else next.delete(identifier);
      return next;
    });
  }, []);

  const handleBatch = useCallback(
    async (action: 'delete' | 'pause' | 'resume') => {
      const ids = [...selected];
      try {
        for (const id of ids) {
          if (action === 'delete') await remove(id);
          else if (action === 'pause') await pause(id);
          else await resume(id);
        }
        toast.success(
          t(action === 'delete' ? 'batch.deleted' : 'batch.updated', { count: ids.length }),
        );
      } catch {
        toast.error(t('batch.delete_failed'));
      }
      setSelected(new Set());
      await refreshTaskList();
      void mutate();
    },
    [selected, remove, pause, resume, refreshTaskList, mutate, t],
  );

  const openDetail = useCallback(
    (identifier: string) => navigate(automationDetailPath(identifier)),
    [navigate],
  );

  const startBlank = useCallback(() => navigate('/automations/new'), [navigate]);

  const isEmptyUnfiltered =
    hasSettled && tasks.length === 0 && !query && statusFilter === 'all' && !error;

  const headerLeft = (
    <Flexbox horizontal align={'center'} gap={12}>
      <Text fontSize={15} weight={600}>
        {t('page.title')}
      </Text>
      <Flexbox horizontal gap={2}>
        <Button
          size={'small'}
          type={scope === 'all' ? 'fill' : 'text'}
          onClick={() => setScope('all')}
        >
          {t('overview.team')}
        </Button>
        <Button
          size={'small'}
          type={scope === 'created' ? 'fill' : 'text'}
          onClick={() => setScope('created')}
        >
          {t('overview.mine')}
        </Button>
      </Flexbox>
    </Flexbox>
  );

  return (
    <Flexbox flex={1} height={'100%'}>
      <NavHeader
        left={headerLeft}
        styles={{ left: { gap: 12, paddingLeft: 8 } }}
        right={
          <Flexbox horizontal align={'center'} gap={6}>
            <ActionIcon
              icon={SearchIcon}
              size={'small'}
              title={t('overview.search_automations')}
              onClick={() => {
                setSearchOpen((v) => !v);
                if (searchOpen) setSearch('');
              }}
            />
            <DropdownMenu
              items={(
                [
                  ['all', t('overview.all_statuses')],
                  ['active', t('status.active')],
                  ['paused', t('status.paused')],
                ] as const
              ).map(([value, label]) => ({
                icon:
                  statusFilter === value ? (
                    <Center height={14} width={14}>
                      <span
                        style={{
                          background: 'currentColor',
                          borderRadius: '50%',
                          display: 'inline-block',
                          height: 6,
                          width: 6,
                        }}
                      />
                    </Center>
                  ) : undefined,
                key: value,
                label,
                onClick: () => setStatusFilter(value),
              }))}
            >
              <Button
                icon={ChevronDownIcon}
                iconPosition={'end'}
                size={'small'}
                title={t('overview.filter_automations')}
              >
                {statusFilter === 'all' ? t('overview.all_statuses') : t(`status.${statusFilter}`)}
              </Button>
            </DropdownMenu>
            <WorkspaceLink to={'/automations/runs'}>
              <Button icon={HistoryIcon} size={'small'} type={'text'}>
                {t('overview.all_runs')}
              </Button>
            </WorkspaceLink>
            <Tooltip title={canCreate ? undefined : reason}>
              <Button
                disabled={!canCreate}
                icon={PlusIcon}
                size={'small'}
                type={'primary'}
                onClick={startBlank}
              >
                {t('page.new_automation')}
              </Button>
            </Tooltip>
          </Flexbox>
        }
      />
      <Flexbox flex={1} style={{ minHeight: 0, overflowY: 'auto' }}>
        <WideScreenContainer fullWidth paddingBlock={16} paddingInline={24}>
          {searchOpen && (
            <Input
              allowClear
              autoFocus
              placeholder={t('overview.search_automations')}
              prefix={<Icon icon={SearchIcon} size={16} />}
              size={'small'}
              style={{ marginBlockEnd: 12, maxWidth: 320 }}
              value={search}
              variant={'filled'}
              onChange={(e) => setSearch(e.target.value)}
            />
          )}
          {error ? (
            <AsyncError error={error} onRetry={() => void mutate()} />
          ) : isLoading && !hasSettled ? (
            <Flexbox padding={24}>
              <Text type={'secondary'}>{t('page.title')}…</Text>
            </Flexbox>
          ) : isEmptyUnfiltered ? (
            <AutomationTemplateGallery persistent={false} onStartBlank={startBlank} />
          ) : (
            <>
              <div className={styles.headerRow}>
                <Tooltip title={t('overview.select_all')}>
                  <Checkbox
                    checked={allChecked}
                    indeterminate={selected.size > 0 && !allChecked}
                    onChange={(checkedAll) =>
                      setSelected(
                        checkedAll
                          ? new Set(visibleTasks.map((task) => task.identifier))
                          : new Set(),
                      )
                    }
                  />
                </Tooltip>
                <span>{t('page.table.name')}</span>
                <span>{t('page.table.created_by')}</span>
                <span>{t('run_history.status')}</span>
                <span>{t('page.table.trigger')}</span>
                <span>{t('page.table.next_run')}</span>
                <span />
              </div>
              {visibleTasks.length === 0 ? (
                <Flexbox align={'center'} paddingBlock={48}>
                  <Text type={'secondary'}>{t('page.no_matches')}</Text>
                </Flexbox>
              ) : (
                visibleTasks.map((task) => (
                  <AutomationRow
                    checked={selected.has(task.identifier)}
                    key={task.identifier}
                    task={task}
                    onCheckedChange={handleCheckedChange}
                    onOpen={openDetail}
                  />
                ))
              )}
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
              {tasks.length > 0 && !isEmptyUnfiltered && (
                <AutomationTemplateGallery persistent onStartBlank={startBlank} />
              )}
            </>
          )}
          {selected.size > 0 && (
            <div className={styles.batchBar}>
              <Text fontSize={12} type={'secondary'}>
                {t('batch.selected', { count: selected.size })}
              </Text>
              <Button size={'small'} onClick={() => handleBatch('resume')}>
                {t('batch.resume')}
              </Button>
              <Button size={'small'} onClick={() => handleBatch('pause')}>
                {t('batch.pause')}
              </Button>
              <Button danger size={'small'} onClick={() => handleBatch('delete')}>
                {t('batch.delete')}
              </Button>
            </div>
          )}
        </WideScreenContainer>
      </Flexbox>
    </Flexbox>
  );
});

export default AutomationsPage;
