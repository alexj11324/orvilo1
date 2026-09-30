import { cssVar } from 'antd-style';
import {
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  LayoutGrid,
  LayoutList,
  Settings2Icon,
} from 'lucide-react';
import { memo, type ReactNode, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import Select from '@/components/Select';
import { Button } from '@/components/ui/button';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DESKTOP_HEADER_ICON_SMALL_SIZE } from '@/const/layoutTokens';
import type { TaskMilestoneRef } from '@/features/Projects/milestoneFilter';
import { useGlobalStore } from '@/store/global';
import type { TaskViewMode } from '@/store/global/initialState';
import { systemStatusSelectors } from '@/store/global/selectors';

import type { TaskGroupBy, TaskListViewOptions, TaskOrderBy } from './listViewOptions';
import { normalizeTaskListViewOptions, toStoredTaskListViewOptions } from './listViewOptions';

/** A display control the active collection fixes, so it has nothing to change. */
export type TaskListPinnedOption = 'ordering' | 'showSubTasks';

interface TasksHeaderProps {
  /**
   * The scope's milestone catalog. Its presence opts the panel into the
   * milestone surfaces — the "Milestones" display-property switch and the
   * milestone grouping dimension — which surfaces without a catalog (global,
   * agent) never offer, rather than grouping on ids they cannot name.
   */
  milestones?: readonly TaskMilestoneRef[];
  options: TaskListViewOptions;
  /**
   * Controls the active collection overrides (see
   * `PAGINATED_COLLECTION_PINNED_OPTIONS`). They are left out of the panel
   * rather than rendered as switches that silently do nothing.
   */
  pinnedOptions?: readonly TaskListPinnedOption[];
  setOptions: (updater: (prev: TaskListViewOptions) => TaskListViewOptions) => void;
  /**
   * The mode the collection is actually rendering. The segmented control
   * reflects this instead of the raw stored preference — surfaces may apply
   * their own default when no preference is stored.
   */
  viewMode: TaskViewMode;
}

const TasksGroupConfig = memo<TasksHeaderProps>(
  ({ milestones, options, pinnedOptions, setOptions, viewMode }) => {
    const [isViewConfigOpen, setIsViewConfigOpen] = useState(false);
    const isPinned = (option: TaskListPinnedOption) => !!pinnedOptions?.includes(option);
    const { t } = useTranslation('chat');
    const updateSystemStatus = useGlobalStore((s) => s.updateSystemStatus);
    const viewDefaults = useGlobalStore(systemStatusSelectors.taskListViewDefaults);
    const hasMilestones = !!milestones;
    const groupingOptions = useMemo<Array<{ label: string; value: TaskGroupBy }>>(
      () => [
        { label: t('taskList.groupBy.none'), value: 'none' },
        { label: t('taskList.groupBy.status'), value: 'status' },
        { label: t('taskList.groupBy.assignee'), value: 'assignee' },
        { label: t('taskList.groupBy.member'), value: 'member' },
        { label: t('taskList.groupBy.priority'), value: 'priority' },
        // Grouping on milestones only exists where a catalog can name them.
        ...(hasMilestones
          ? [{ label: t('taskList.groupBy.milestone'), value: 'milestone' as const }]
          : []),
      ],
      [hasMilestones, t],
    );
    const boardGroupingOptions = useMemo(
      // The board has no milestone columns — `normalizeKanbanGroupBy` would
      // silently fall back to status, so the dimension is left out rather
      // than offered as a pick that does something else.
      () => groupingOptions.filter((item) => item.value !== 'none' && item.value !== 'milestone'),
      [groupingOptions],
    );
    const orderOptions = useMemo<Array<{ label: string; value: TaskOrderBy }>>(
      () => [
        // "Manual" orders by the same position the board's drag-and-drop
        // persists, so the list shows exactly what a drag would reorder.
        { label: t('taskList.orderBy.manual'), value: 'manual' },
        { label: t('taskList.orderBy.status'), value: 'status' },
        { label: t('taskList.orderBy.priority'), value: 'priority' },
        { label: t('taskList.orderBy.updatedAt'), value: 'updatedAt' },
        { label: t('taskList.orderBy.createdAt'), value: 'createdAt' },
        { label: t('taskList.orderBy.assignee'), value: 'assignee' },
        { label: t('taskList.orderBy.title'), value: 'title' },
      ],
      [t],
    );

    const subGroupingOptions = useMemo(
      () =>
        groupingOptions.filter((item) => item.value !== options.groupBy || item.value === 'none'),
      [groupingOptions, options.groupBy],
    );
    const isSubGroupingEnabled = options.groupBy !== 'none';
    const groupingSelectOptions = viewMode === 'kanban' ? boardGroupingOptions : groupingOptions;
    // A stored pick is only renderable where the select carries it: the board
    // can't express 'none' or 'milestone', and 'milestone' also needs the
    // scope's catalog. Elsewhere display the fallback the surface groups by
    // rather than a raw value (TaskList degrades milestone the same way).
    const milestoneGroupingAvailable = hasMilestones && viewMode !== 'kanban';
    const groupingValue =
      (viewMode === 'kanban' && options.groupBy === 'none') ||
      (options.groupBy === 'milestone' && !milestoneGroupingAvailable)
        ? 'status'
        : options.groupBy;
    const subGroupingValue =
      options.subGroupBy === 'milestone' && !milestoneGroupingAvailable
        ? 'none'
        : options.subGroupBy;

    interface ConfigItem {
      children: ReactNode;
      label: string;
    }

    const groupingFormItem = {
      children: (
        <Select
          options={groupingSelectOptions}
          size={'small'}
          style={{ width: 150 }}
          value={groupingValue}
          onChange={(value: TaskGroupBy) => {
            setOptions((prev) => ({
              ...prev,
              groupBy: value,
              subGroupBy: prev.subGroupBy === value ? 'none' : prev.subGroupBy,
            }));
          }}
        />
      ),
      label: viewMode === 'kanban' ? t('taskList.form.columns') : t('taskList.form.grouping'),
    } satisfies ConfigItem;

    const showCompletedFormItem = {
      children: (
        <Switch
          checked={!options.hideCompleted}
          size="sm"
          onCheckedChange={(checked) => {
            setOptions((prev) => ({ ...prev, hideCompleted: !checked }));
          }}
        />
      ),
      label: t('taskList.form.showCompleted'),
    } satisfies ConfigItem;

    const formItems: ConfigItem[] = [
      groupingFormItem,
      ...(isSubGroupingEnabled
        ? [
            {
              children: (
                <Select
                  options={subGroupingOptions}
                  size={'small'}
                  style={{ width: 150 }}
                  value={subGroupingValue}
                  onChange={(value: TaskGroupBy) => {
                    setOptions((prev) => ({ ...prev, subGroupBy: value }));
                  }}
                />
              ),
              label: t('taskList.form.subGrouping'),
            } satisfies ConfigItem,
          ]
        : []),
      ...(isPinned('ordering')
        ? []
        : [
            {
              children: (
                <div className="flex items-center gap-2">
                  <ActionIcon
                    size={'small'}
                    style={{ borderRadius: 9999 }}
                    icon={
                      options.orderDirection === 'asc' ? ArrowDownWideNarrow : ArrowUpNarrowWide
                    }
                    onClick={() => {
                      setOptions((prev) => ({
                        ...prev,
                        orderDirection: prev.orderDirection === 'asc' ? 'desc' : 'asc',
                      }));
                    }}
                  />
                  <Select
                    options={orderOptions}
                    size={'small'}
                    style={{ width: 112 }}
                    value={options.orderBy}
                    onChange={(value: TaskOrderBy) => {
                      setOptions((prev) => ({ ...prev, orderBy: value }));
                    }}
                  />
                </div>
              ),
              label: t('taskList.form.ordering'),
            } satisfies ConfigItem,
          ]),
      {
        children: (
          <Switch
            checked={options.orderCompletedByRecency}
            size="sm"
            onCheckedChange={(checked) => {
              setOptions((prev) => ({ ...prev, orderCompletedByRecency: checked }));
            }}
          />
        ),
        label: t('taskList.form.orderCompletedByRecency'),
      },
      showCompletedFormItem,
      ...(isPinned('showSubTasks')
        ? []
        : [
            {
              children: (
                <Switch
                  checked={options.showSubTasks}
                  size="sm"
                  onCheckedChange={(checked) => {
                    setOptions((prev) => ({ ...prev, showSubTasks: checked }));
                  }}
                />
              ),
              label: t('taskList.form.showSubTasks'),
            } satisfies ConfigItem,
          ]),
      // Only meaningful once sub-tasks are on the list — otherwise the toggle
      // would sit there controlling nothing.
      ...(options.showSubTasks || isPinned('showSubTasks')
        ? [
            {
              children: (
                <Switch
                  checked={options.nestedSubTasks}
                  size="sm"
                  onCheckedChange={(checked) => {
                    setOptions((prev) => ({ ...prev, nestedSubTasks: checked }));
                  }}
                />
              ),
              label: t('taskList.form.nestedSubTasks'),
            } satisfies ConfigItem,
          ]
        : []),
      // Linear's "Milestones" display property — the row's milestone chip.
      // Only offered where the scope ships a catalog the chip can read.
      ...(hasMilestones
        ? [
            {
              children: (
                <Switch
                  checked={options.showMilestone}
                  size="sm"
                  onCheckedChange={(checked) => {
                    setOptions((prev) => ({ ...prev, showMilestone: checked }));
                  }}
                />
              ),
              label: t('taskList.form.milestones'),
            } satisfies ConfigItem,
          ]
        : []),
    ];
    const boardFormItems = [groupingFormItem, showCompletedFormItem];

    const panelContent = (
      <div className="flex w-[280px] flex-col gap-3">
        <Tabs
          value={viewMode}
          onValueChange={(key) =>
            updateSystemStatus({ taskListViewMode: key as TaskViewMode }, 'updateTaskListViewMode')
          }
        >
          <TabsList className="flex w-full">
            <TabsTrigger className="flex-1 gap-1.5" value="list">
              <LayoutList size={'1em'} />
              {t('taskList.view.list')}
            </TabsTrigger>
            <TabsTrigger className="flex-1 gap-1.5" value="kanban">
              <LayoutGrid size={'1em'} />
              {t('taskList.view.board')}
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <FieldGroup className="gap-3">
          {(viewMode === 'kanban' ? boardFormItems : formItems).map((item) => (
            <Field key={item.label} orientation={'horizontal'}>
              <FieldLabel style={{ color: cssVar.colorTextSecondary, fontSize: 13 }}>
                {item.label}
              </FieldLabel>
              {item.children}
            </Field>
          ))}
        </FieldGroup>
        <div
          className="flex justify-between"
          style={{ borderTop: `1px solid ${cssVar.colorBorderSecondary}`, paddingTop: 8 }}
        >
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              // Restore the user's saved baseline; without one, the built-in
              // defaults are the baseline.
              setOptions(() => normalizeTaskListViewOptions(viewDefaults));
            }}
          >
            {t('taskList.form.reset')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              updateSystemStatus(
                { taskListViewDefaults: toStoredTaskListViewOptions(options) },
                'setTaskListViewDefaults',
              );
            }}
          >
            {t('taskList.form.setDefault')}
          </Button>
        </div>
      </div>
    );

    return (
      <Popover open={isViewConfigOpen} onOpenChange={setIsViewConfigOpen}>
        <PopoverTrigger
          render={
            <ActionIcon
              icon={Settings2Icon}
              size={DESKTOP_HEADER_ICON_SMALL_SIZE}
              style={{ borderRadius: 9999 }}
            />
          }
        />
        <PopoverContent align={'end'} className="w-auto p-3">
          {panelContent}
        </PopoverContent>
      </Popover>
    );
  },
);

export default TasksGroupConfig;
