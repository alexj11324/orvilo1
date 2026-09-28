import { type FormItemProps } from '@lobehub/ui';
import { Flexbox, Form, Icon, Popover } from '@lobehub/ui';
import { ActionIcon, Button, Select, Switch, Tabs } from '@lobehub/ui/base-ui';
import { createStaticStyles, cssVar } from 'antd-style';
import {
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  LayoutGrid,
  LayoutList,
  Settings2Icon,
} from 'lucide-react';
import { memo, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

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

const styles = createStaticStyles(({ css, cssVar }) => {
  return {
    form: css`
      label {
        font-size: 13px !important;
        color: ${cssVar.colorTextSecondary} !important;
      }
    `,
  };
});

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
    } satisfies FormItemProps;

    const showCompletedFormItem = {
      children: (
        <Switch
          checked={!options.hideCompleted}
          size={'small'}
          onChange={(checked) => {
            setOptions((prev) => ({ ...prev, hideCompleted: !checked }));
          }}
        />
      ),
      minWidth: undefined,
      label: t('taskList.form.showCompleted'),
    } satisfies FormItemProps;

    const formItems: FormItemProps[] = [
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
            } satisfies FormItemProps,
          ]
        : []),
      ...(isPinned('ordering')
        ? []
        : [
            {
              children: (
                <Flexbox horizontal align={'center'} gap={8}>
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
                </Flexbox>
              ),
              label: t('taskList.form.ordering'),
            } satisfies FormItemProps,
          ]),
      {
        children: (
          <Switch
            checked={options.orderCompletedByRecency}
            size={'small'}
            onChange={(checked) => {
              setOptions((prev) => ({ ...prev, orderCompletedByRecency: checked }));
            }}
          />
        ),
        minWidth: undefined,
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
                  size={'small'}
                  onChange={(checked) => {
                    setOptions((prev) => ({ ...prev, showSubTasks: checked }));
                  }}
                />
              ),
              minWidth: undefined,
              label: t('taskList.form.showSubTasks'),
            } satisfies FormItemProps,
          ]),
      // Only meaningful once sub-tasks are on the list — otherwise the toggle
      // would sit there controlling nothing.
      ...(options.showSubTasks || isPinned('showSubTasks')
        ? [
            {
              children: (
                <Switch
                  checked={options.nestedSubTasks}
                  size={'small'}
                  onChange={(checked) => {
                    setOptions((prev) => ({ ...prev, nestedSubTasks: checked }));
                  }}
                />
              ),
              minWidth: undefined,
              label: t('taskList.form.nestedSubTasks'),
            } satisfies FormItemProps,
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
                  size={'small'}
                  onChange={(checked) => {
                    setOptions((prev) => ({ ...prev, showMilestone: checked }));
                  }}
                />
              ),
              minWidth: undefined,
              label: t('taskList.form.milestones'),
            } satisfies FormItemProps,
          ]
        : []),
    ];
    const boardFormItems = [groupingFormItem, showCompletedFormItem];

    const panelContent = (
      <Flexbox gap={12} width={280}>
        <Tabs
          activeKey={viewMode}
          items={[
            { icon: <Icon icon={LayoutList} />, key: 'list', label: t('taskList.view.list') },
            {
              icon: <Icon icon={LayoutGrid} />,
              key: 'kanban',
              label: t('taskList.view.board'),
            },
          ]}
          styles={{
            list: { display: 'flex', width: '100%' },
            tab: { flex: 1 },
          }}
          onChange={(key) =>
            updateSystemStatus({ taskListViewMode: key as TaskViewMode }, 'updateTaskListViewMode')
          }
        />
        <Form
          className={styles.form}
          items={viewMode === 'kanban' ? boardFormItems : formItems}
          itemsType={'flat'}
          size={'small'}
          variant={'borderless'}
          styles={{
            item: { padding: 0 },
          }}
        />
        <Flexbox
          horizontal
          justify={'space-between'}
          style={{ borderTop: `1px solid ${cssVar.colorBorderSecondary}`, paddingTop: 8 }}
        >
          <Button
            size={'small'}
            type={'text'}
            onClick={() => {
              // Restore the user's saved baseline; without one, the built-in
              // defaults are the baseline.
              setOptions(() => normalizeTaskListViewOptions(viewDefaults));
            }}
          >
            {t('taskList.form.reset')}
          </Button>
          <Button
            size={'small'}
            type={'text'}
            onClick={() => {
              updateSystemStatus(
                { taskListViewDefaults: toStoredTaskListViewOptions(options) },
                'setTaskListViewDefaults',
              );
            }}
          >
            {t('taskList.form.setDefault')}
          </Button>
        </Flexbox>
      </Flexbox>
    );

    return (
      <Popover
        arrow={false}
        content={panelContent}
        open={isViewConfigOpen}
        placement={'bottomRight'}
        trigger={['click']}
        onOpenChange={setIsViewConfigOpen}
      >
        <ActionIcon
          icon={Settings2Icon}
          size={DESKTOP_HEADER_ICON_SMALL_SIZE}
          style={{ borderRadius: 9999 }}
        />
      </Popover>
    );
  },
);

export default TasksGroupConfig;
