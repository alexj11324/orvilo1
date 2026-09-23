'use client';

import { type DropdownItem, DropdownMenu, Flexbox, Icon, type MenuInfo } from '@lobehub/ui';
import { ActionIcon, Button, Text } from '@lobehub/ui/base-ui';
import type { TaskStatus } from '@orvilo/types';
import { createStaticStyles, cssVar } from 'antd-style';
import { BarChart3Icon, CircleDashedIcon, Trash2Icon, UserRoundIcon, XIcon } from 'lucide-react';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { getPriorityIconColor, PRIORITY_LEVELS } from '@/components/PriorityIcon';
import AssigneeMemberSelector from '@/features/AgentTasks/features/AssigneeMemberSelector';
import { PRIORITY_META } from '@/features/AgentTasks/features/TaskPriorityTag';
import {
  STATUS_META,
  USER_SELECTABLE_STATUSES,
} from '@/features/AgentTasks/features/taskStatusMeta';

const styles = createStaticStyles(({ css }) => ({
  /**
   * Linear's floating bulk bar: pinned to the bottom of the list scrollport
   * (`position: sticky` as the scroll body's last child), centered on the
   * column, elevated above the rows it slides over.
   */
  bar: css`
    position: sticky;
    z-index: 5;
    inset-block-end: 16px;

    display: flex;
    gap: 6px;
    align-items: center;

    width: fit-content;
    margin-block-start: 8px;
    margin-inline: auto;
    padding-block: 6px;
    padding-inline: 12px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: ${cssVar.borderRadiusLG};

    background: ${cssVar.colorBgElevated};
    box-shadow: ${cssVar.boxShadowSecondary};
  `,
  count: css`
    flex: none;
    padding-inline-end: 4px;
    white-space: nowrap;
  `,
}));

interface BulkActionsBarProps {
  /**
   * Assignee every selected task shares — drives the picker's current-mark.
   * A sentinel (e.g. `__bulk_mixed__`) marks a mixed selection so Unassigned
   * stays clickable; `undefined` when the set is uniformly unassigned.
   */
  assigneeCurrentId?: string | null;
  /** Mutations in flight — actions disable until the pass settles. */
  busy?: boolean;
  count: number;
  /** `null` unassigns. */
  onAssignee: (userId: string | null) => void;
  onClear: () => void;
  onDelete: () => void;
  onSetPriority: (priority: number) => void;
  onSetStatus: (status: TaskStatus) => void;
}

/**
 * Floating bulk bar for a multi-selected issue list. Every action maps to a
 * real task mutation — status (`applyWorkQueryStatusChange` so Linear-linked
 * rows still go through `moveBoard`), priority + assignee (`task.update`),
 * delete (`task.delete` behind a confirm). No labels action: the task model
 * has none.
 */
const BulkActionsBar = memo<BulkActionsBarProps>(
  ({
    assigneeCurrentId,
    busy,
    count,
    onAssignee,
    onClear,
    onDelete,
    onSetPriority,
    onSetStatus,
  }) => {
    const { t } = useTranslation(['common', 'chat']);

    const statusItems = useMemo<DropdownItem[]>(
      () =>
        USER_SELECTABLE_STATUSES.map((status) => {
          const meta = STATUS_META[status];
          return {
            icon: <Icon color={meta.color} icon={meta.icon} size={16} />,
            key: status,
            label: t(`chat:taskDetail.${meta.labelKey}` as never, {
              defaultValue: meta.label,
            }),
            onClick: ({ domEvent }: MenuInfo) => {
              domEvent.stopPropagation();
              onSetStatus(status);
            },
          };
        }),
      [onSetStatus, t],
    );

    const priorityItems = useMemo<DropdownItem[]>(
      () =>
        PRIORITY_LEVELS.map((level) => {
          const meta = PRIORITY_META[level];
          const PriorityIcon = meta.icon;
          return {
            icon: <PriorityIcon color={getPriorityIconColor(level)} size={16} />,
            key: String(level),
            label: t(`chat:taskDetail.${meta.labelKey}` as never, {
              defaultValue: meta.label,
            }),
            onClick: ({ domEvent }: MenuInfo) => {
              domEvent.stopPropagation();
              onSetPriority(level);
            },
          };
        }),
      [onSetPriority, t],
    );

    return (
      // `data-bulk-actions` keeps the click-away handler from clearing the
      // selection when the pointer lands on the bar's own chrome; the
      // `data-row-interactive` marker does the same for row-level guards.
      <div data-bulk-actions data-row-interactive className={styles.bar}>
        <Text className={styles.count} fontSize={12} weight={500}>
          {t('myWork.bulk.selected', { count })}
        </Text>
        <DropdownMenu items={statusItems}>
          <Button disabled={busy} icon={CircleDashedIcon} size={'small'}>
            {t('myWork.bulk.status')}
          </Button>
        </DropdownMenu>
        <DropdownMenu items={priorityItems}>
          <Button disabled={busy} icon={BarChart3Icon} size={'small'}>
            {t('myWork.bulk.priority')}
          </Button>
        </DropdownMenu>
        <AssigneeMemberSelector
          currentUserId={assigneeCurrentId}
          disabled={busy}
          onChange={onAssignee}
        >
          <Button disabled={busy} icon={UserRoundIcon} size={'small'}>
            {t('myWork.bulk.assignee')}
          </Button>
        </AssigneeMemberSelector>
        <Button danger disabled={busy} icon={Trash2Icon} size={'small'} onClick={onDelete}>
          {t('delete')}
        </Button>
        <Flexbox flex={'none'}>
          <ActionIcon
            icon={XIcon}
            size={'small'}
            title={t('myWork.bulk.clear')}
            onClick={onClear}
          />
        </Flexbox>
      </div>
    );
  },
);

BulkActionsBar.displayName = 'BulkActionsBar';

export default BulkActionsBar;
