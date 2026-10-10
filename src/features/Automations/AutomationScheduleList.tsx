import type { TaskListItem } from '@orvilo/types';
import { cn } from 'cn';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import {
  MoreHorizontalIcon,
  PauseIcon,
  PlayIcon,
  SearchIcon,
  Settings2Icon,
  Trash2Icon,
  XIcon,
} from 'lucide-react';
import {
  createElement,
  memo,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import AsyncError from '@/components/AsyncError';
import { DropdownMenu } from '@/components/ItemsMenu';
import SimpleEmpty from '@/components/SimpleEmpty';
import TablePagination from '@/components/TablePagination';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { usePermission } from '@/hooks/usePermission';
import { useMcpEventsStore } from '@/store/mcpEvents';
import { useTaskStore } from '@/store/task';
import { CLICKABLE_FOCUS_RING, clickableProps } from '@/utils/clickableProps';

import AssigneeUserAvatar from '../AgentTasks/features/AssigneeUserAvatar';
import { useUserDisplayMeta } from '../AgentTasks/shared/useUserDisplayMeta';
import { AutomationScheduleSkeleton } from './AutomationSkeleton';
import AutomationStatusBadge from './AutomationStatusBadge';
import {
  automationDetailPath,
  automationNextRun,
  automationStatusOf,
  automationTriggerSummary,
  eventAutomationStatusOf,
  SCHEDULED_TASKS_PAGE_SIZE,
} from './shared';
import { useAutomationActions } from './useAutomationActions';

dayjs.extend(relativeTime);

const styles = {
  batchBar:
    'sticky bottom-4 mx-auto flex w-fit items-center gap-2 rounded-[12px] border border-sidebar-border bg-popover px-4 py-2 shadow-(--shadow-popover)',
  headerRow:
    'grid items-center gap-3 border-b border-sidebar-border px-2 py-1.5 text-[12px] font-medium text-(--ant-color-text-tertiary) grid-cols-[28px_minmax(0,2fr)_130px_110px_minmax(0,1.4fr)_110px_40px]',
  row: 'grid cursor-pointer items-center gap-3 rounded-(--radius-card) p-2 hover:bg-accent grid-cols-[28px_minmax(0,2fr)_130px_110px_minmax(0,1.4fr)_110px_40px]',
  titleCell: 'flex min-w-0 items-center gap-2',
  titleText: 'truncate text-[13px] font-medium',
};

const CreatedByCell = memo<{ userId: string | null }>(({ userId }) => {
  const meta = useUserDisplayMeta(userId);
  return (
    <div className="flex items-center gap-1.5" style={{ minWidth: 0 }}>
      <AssigneeUserAvatar size={16} userId={userId} />
      <div className="truncate min-w-0 text-[12px] text-muted-foreground">{meta?.title ?? ''}</div>
    </div>
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
  const useFetchEventTriggers = useMcpEventsStore((s) => s.useFetchEventTriggers);
  const eventBindings = useFetchEventTriggers(
    task.automationMode === 'event' ? task.id : undefined,
  );
  const status =
    task.automationMode === 'event'
      ? eventAutomationStatusOf(eventBindings.data?.data.triggers[0])
      : automationStatusOf(task.status);
  const eventStateUnavailable =
    task.automationMode === 'event' && (!eventBindings.data || eventBindings.error);
  const nextRun = automationNextRun(task);

  return (
    <div className={styles.row} onClick={() => onOpen(task.identifier)}>
      <div onClick={(e) => e.stopPropagation()}>
        <Checkbox
          checked={checked}
          onCheckedChange={(next) => onCheckedChange(task.identifier, next === true)}
        />
      </div>
      <div className={styles.titleCell}>
        <span {...clickableProps()} className={cn(styles.titleText, CLICKABLE_FOCUS_RING)}>
          {task.name || task.identifier}
        </span>
      </div>
      <CreatedByCell userId={task.createdByUserId} />
      {eventStateUnavailable ? (
        <span className="text-[12px] text-muted-foreground">
          {t(eventBindings.error ? 'events.bindingUnavailable' : 'page.loading')}
        </span>
      ) : (
        <AutomationStatusBadge status={status} />
      )}
      <div className="truncate min-w-0 text-[12px] text-muted-foreground">
        {automationTriggerSummary(task, t)}
      </div>
      <div className="truncate min-w-0 text-[12px] text-muted-foreground">
        {nextRun ? dayjs(nextRun.toDate()).fromNow() : '—'}
      </div>
      <div onClick={(e) => e.stopPropagation()}>
        <DropdownMenu
          items={[
            {
              icon: <PlayIcon />,
              key: 'run',
              label: t('detail.run_now'),
              onClick: () =>
                runNow(task).then(
                  () => toast.success(t('detail.toast_triggered')),
                  () => toast.error(t('detail.toast_trigger_failed')),
                ),
            },
            {
              icon: createElement(
                task.automationMode === 'event' && status !== 'active'
                  ? Settings2Icon
                  : status === 'paused'
                    ? PlayIcon
                    : PauseIcon,
              ),
              key: 'toggle',
              label: t(
                task.automationMode === 'event' && status !== 'active'
                  ? 'settings.tab_settings'
                  : status === 'paused'
                    ? 'actions.resume'
                    : 'actions.pause',
              ),
              onClick: () =>
                (status === 'paused' || (task.automationMode === 'event' && status !== 'active')
                  ? resume(task)
                  : pause(task)
                ).catch(() => toast.error(t('actions.update_failed'))),
            },
            { type: 'divider' },
            {
              danger: true,
              icon: <Trash2Icon />,
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
 * menu. Task rows come from the owner; event rows observe the existing
 * trigger cache because definition state differs from Task execution state.
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
    const { batch } = useAutomationActions();
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
        const targets = tasks.filter((task) => selected.has(task.identifier));
        try {
          if ((await batch(action, targets)) === 'settings') return;
          toast.success(
            t(action === 'delete' ? 'batch.deleted' : 'batch.updated', { count: targets.length }),
          );
        } catch {
          toast.error(t(action === 'delete' ? 'batch.delete_failed' : 'batch.update_failed'));
        }
        setSelected(new Set());
        // The ordinary task list shows automated tasks too, so it is stale after
        // a batch pause/resume/delete; refresh it alongside this surface.
        await refreshTaskList();
        await onRefetch();
      },
      [selected, tasks, batch, refreshTaskList, onRefetch, t],
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
          <AutomationScheduleSkeleton />
        ) : isEmptyUnfiltered ? (
          emptyContent
        ) : (
          <>
            <div className="relative" style={{ marginBlockEnd: 12, maxWidth: 320 }}>
              <SearchIcon
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                size={16}
              />
              <Input
                className="h-7 pl-8"
                placeholder={t('overview.search_automations')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <ActionIcon
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                  icon={XIcon}
                  size="small"
                  title={t('overview.search_automations')}
                  onClick={() => setSearch('')}
                />
              )}
            </div>
            <div className={styles.headerRow}>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <span className="inline-flex">
                        <Checkbox
                          checked={allChecked}
                          indeterminate={selected.size > 0 && !allChecked}
                          onCheckedChange={(checkedAll) =>
                            setSelected(
                              checkedAll
                                ? new Set(visibleTasks.map((task) => task.identifier))
                                : new Set(),
                            )
                          }
                        />
                      </span>
                    }
                  />
                  <TooltipContent>{t('overview.select_all')}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <span>{t('page.table.name')}</span>
              <span>{t('page.table.created_by')}</span>
              <span>{t('run_history.status')}</span>
              <span>{t('page.table.trigger')}</span>
              <span>{t('page.table.next_run')}</span>
              <span />
            </div>
            {visibleTasks.length === 0 ? (
              <SimpleEmpty description={t('page.no_matches')} />
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
              <div className="flex justify-center py-4">
                <TablePagination
                  current={page}
                  pageSize={SCHEDULED_TASKS_PAGE_SIZE}
                  pageSizeOptions={[SCHEDULED_TASKS_PAGE_SIZE]}
                  total={total}
                  onChange={onPageChange}
                />
              </div>
            )}
            {tasks.length > 0 && footer}
          </>
        )}
        {selected.size > 0 && (
          <div className={styles.batchBar}>
            <div className="text-[12px] text-muted-foreground">
              {t('batch.selected', { count: selected.size })}
            </div>
            <Button size="sm" onClick={() => handleBatch('resume')}>
              {t(
                tasks.some(
                  (task) => selected.has(task.identifier) && task.automationMode === 'event',
                )
                  ? 'settings.tab_settings'
                  : 'batch.resume',
              )}
            </Button>
            <Button size="sm" onClick={() => handleBatch('pause')}>
              {t('batch.pause')}
            </Button>
            <Button size="sm" variant="destructive" onClick={() => handleBatch('delete')}>
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
