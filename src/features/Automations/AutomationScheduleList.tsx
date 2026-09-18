import { Flexbox, Icon, Input, Tooltip } from '@lobehub/ui';
import { ActionIcon, Button, Checkbox, DropdownMenu, Text, toast } from '@lobehub/ui/base-ui';
import type { TaskListItem } from '@orvilo/types';
import { Pagination } from 'antd';
import { createStaticStyles } from 'antd-style';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { MoreHorizontalIcon, PauseIcon, PlayIcon, SearchIcon, Trash2Icon } from 'lucide-react';
import { memo, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import AsyncError from '@/components/AsyncError';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { usePermission } from '@/hooks/usePermission';
import { useTaskStore } from '@/store/task';

import AssigneeUserAvatar from '../AgentTasks/features/AssigneeUserAvatar';
import { useUserDisplayMeta } from '../AgentTasks/shared/useUserDisplayMeta';
import AutomationStatusBadge from './AutomationStatusBadge';
import {
  automationDetailPath,
  automationNextRun,
  automationStatusOf,
  automationTriggerSummary,
  SCHEDULED_TASKS_PAGE_SIZE,
} from './shared';
import { useAutomationActions } from './useAutomationActions';

dayjs.extend(relativeTime);

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

const CreatedByCell = memo<{ userId: string | null }>(({ userId }) => {
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

CreatedByCell.displayName = 'CreatedByCell';

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

AutomationRow.displayName = 'AutomationRow';

export interface AutomationScheduleListProps {
  /**
   * Shown when the list is empty and nothing narrows it. The Tasks page passes
   * a plain description; the Automations page passes its template gallery.
   */
  emptyContent: ReactNode;
  error?: unknown;
  /** Rendered after the rows when the unfiltered result is non-empty. */
  footer?: ReactNode;
  /** Whether the owning fetch has answered at least once for the active filters. */
  hasSettled: boolean;
  /** A server-side narrowing (scope or status) is applied. */
  isFiltered: boolean;
  isLoading: boolean;
  onPageChange: (page: number) => void;
  /** Refetch the owning handle — used by Retry and after a batch mutation. */
  onRefetch: () => void | Promise<unknown>;
  page: number;
  tasks: TaskListItem[];
  total: number;
}

/**
 * The scheduled-task surface: search, selection, batch actions and the row
 * menu, with no fetch of its own.
 *
 * Both doors into this list — the Tasks page's automations tab and the
 * Automations page — already own the SWR handle that produced `tasks`, so the
 * component takes rows and reports back through `onRefetch` instead of opening
 * a second read. Search, selection and the open/closed state of the row menu
 * are presentation state and stay here.
 */
const AutomationScheduleList = memo<AutomationScheduleListProps>(
  ({
    emptyContent,
    error,
    footer,
    hasSettled,
    isFiltered,
    isLoading,
    onPageChange,
    onRefetch,
    page,
    tasks,
    total,
  }) => {
    const { t } = useTranslation('automation');
    const navigate = useWorkspaceAwareNavigate();
    const refreshTaskList = useTaskStore((s) => s.refreshTaskList);
    const { pause, remove, resume } = useAutomationActions();
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState(() => new Set<string>());

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
        // The ordinary task list shows automated tasks too, so it is stale after
        // a batch pause/resume/delete; refresh it alongside this surface.
        await refreshTaskList();
        await onRefetch();
      },
      [selected, remove, pause, resume, refreshTaskList, onRefetch, t],
    );

    const openDetail = useCallback(
      (identifier: string) => navigate(automationDetailPath(identifier)),
      [navigate],
    );

    const isEmptyUnfiltered = hasSettled && tasks.length === 0 && !query && !isFiltered && !error;

    return (
      <>
        {error ? (
          <AsyncError error={error} onRetry={() => void onRefetch()} />
        ) : isLoading ? (
          <Flexbox padding={24}>
            <Text type={'secondary'}>{t('page.loading')}</Text>
          </Flexbox>
        ) : isEmptyUnfiltered ? (
          emptyContent
        ) : (
          <>
            <Input
              allowClear
              placeholder={t('overview.search_automations')}
              prefix={<Icon icon={SearchIcon} size={16} />}
              size={'small'}
              style={{ marginBlockEnd: 12, maxWidth: 320 }}
              value={search}
              variant={'filled'}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className={styles.headerRow}>
              <Tooltip title={t('overview.select_all')}>
                <Checkbox
                  checked={allChecked}
                  indeterminate={selected.size > 0 && !allChecked}
                  onChange={(checkedAll) =>
                    setSelected(
                      checkedAll ? new Set(visibleTasks.map((task) => task.identifier)) : new Set(),
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
            {(total > SCHEDULED_TASKS_PAGE_SIZE || page > 1) && (
              <Flexbox horizontal justify={'center'} paddingBlock={16}>
                <Pagination
                  current={page}
                  pageSize={SCHEDULED_TASKS_PAGE_SIZE}
                  showSizeChanger={false}
                  total={total}
                  onChange={onPageChange}
                />
              </Flexbox>
            )}
            {tasks.length > 0 && footer}
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
      </>
    );
  },
);

AutomationScheduleList.displayName = 'AutomationScheduleList';

export default AutomationScheduleList;
