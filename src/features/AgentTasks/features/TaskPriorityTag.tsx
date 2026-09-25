import type { IconType } from '@lobehub/icons';
import { type DropdownItem, DropdownMenu, Icon, type MenuInfo, Tooltip } from '@lobehub/ui';
import { createStaticStyles, cssVar } from 'antd-style';
import { Loader2Icon } from 'lucide-react';
import type { ReactNode } from 'react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  getPriorityIconColor,
  PRIORITY_ICONS,
  PRIORITY_LEVELS,
  resolvePriorityLevel,
} from '@/components/PriorityIcon';
import { usePermission } from '@/hooks/usePermission';
import { useTaskStore } from '@/store/task';

import { renderMenuExtra } from './menuExtra';

interface PriorityMeta {
  icon: IconType;
  label: string;
  labelKey: string;
  level: number;
}

export const PRIORITY_META: Record<number, PriorityMeta> = {
  0: { icon: PRIORITY_ICONS[0], label: 'No priority', labelKey: 'priority.none', level: 0 },
  1: { icon: PRIORITY_ICONS[1], label: 'Urgent', labelKey: 'priority.urgent', level: 1 },
  2: { icon: PRIORITY_ICONS[2], label: 'High', labelKey: 'priority.high', level: 2 },
  3: { icon: PRIORITY_ICONS[3], label: 'Normal', labelKey: 'priority.normal', level: 3 },
  4: { icon: PRIORITY_ICONS[4], label: 'Low', labelKey: 'priority.low', level: 4 },
};

const styles = createStaticStyles(({ css, cssVar }) => ({
  trigger: css`
    cursor: pointer;

    display: inline-flex;
    align-items: center;

    color: ${cssVar.colorTextDescription};

    transition: color ${cssVar.motionDurationMid};

    &:hover {
      color: ${cssVar.colorText};
    }
  `,
  triggerUrgent: css`
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    color: ${cssVar.orange};
  `,
  triggerDisabled: css`
    cursor: not-allowed;
    opacity: 0.5;

    &:hover {
      color: ${cssVar.colorTextDescription};
      filter: none;
    }
  `,
}));

interface TaskPriorityTagProps {
  children?: ReactNode;
  disableDropdown?: boolean;
  onChange?: (priority: number) => void;
  priority?: number | null;
  size?: number;
  taskIdentifier?: string;
}

const TaskPriorityTag = memo<TaskPriorityTagProps>(
  ({ children, disableDropdown, onChange, size = 16, priority, taskIdentifier }) => {
    const [loading, setLoading] = useState(false);
    const [open, setOpen] = useState(false);
    const { t } = useTranslation('chat');
    const { allowed: canEditTask, reason } = usePermission('create_content');
    const updateTask = useTaskStore((s) => s.updateTask);
    const refreshTaskList = useTaskStore((s) => s.refreshTaskList);

    const currentLevel = resolvePriorityLevel(priority);
    const meta = PRIORITY_META[currentLevel];

    const handlePriorityChange = useCallback(
      async (nextPriority: number) => {
        if (!canEditTask) return;
        if (nextPriority === currentLevel) return;
        if (onChange) {
          onChange(nextPriority);
          return;
        }
        if (!taskIdentifier) return;
        setLoading(true);
        await updateTask(taskIdentifier, { priority: nextPriority });
        await refreshTaskList();
        setLoading(false);
      },
      [canEditTask, currentLevel, onChange, refreshTaskList, taskIdentifier, updateTask],
    );

    const handlePriorityChangeRef = useRef(handlePriorityChange);
    handlePriorityChangeRef.current = handlePriorityChange;

    useEffect(() => {
      if (!open) return;
      const onKeyDown = (event: KeyboardEvent) => {
        const num = Number.parseInt(event.key, 10);
        if (Number.isNaN(num)) return;
        // Priority digits are the level values themselves (0 = No priority).
        if (!PRIORITY_LEVELS.includes(num as (typeof PRIORITY_LEVELS)[number])) return;
        event.preventDefault();
        event.stopPropagation();
        void handlePriorityChangeRef.current(num);
        setOpen(false);
      };
      document.addEventListener('keydown', onKeyDown, true);
      return () => document.removeEventListener('keydown', onKeyDown, true);
    }, [open]);

    const menuItems = useMemo<DropdownItem[]>(
      () =>
        Object.entries(PRIORITY_META).map(([key, value]) => {
          const level = Number(key);
          const IconRender = value.icon;
          const isCurrent = level === currentLevel;
          return {
            extra: renderMenuExtra(String(level), isCurrent),
            icon: <IconRender color={getPriorityIconColor(level)} size={16} />,
            key,
            label: t(`taskDetail.${value.labelKey}` as never, { defaultValue: value.label }),
            onClick: ({ domEvent }: MenuInfo) => {
              domEvent.stopPropagation();
              void handlePriorityChange(level);
            },
          };
        }),
      [currentLevel, handlePriorityChange, t],
    );

    const IconRender = meta.icon;
    const isUrgent = currentLevel === 1;

    const triggerNode =
      children ||
      (loading ? (
        <Icon spin color={cssVar.colorTextDescription} icon={Loader2Icon} size={size} />
      ) : (
        <Tooltip title={t(`taskDetail.${meta.labelKey}` as never, { defaultValue: meta.label })}>
          <span
            className={isUrgent ? styles.triggerUrgent : styles.trigger}
            onClick={(e) => e.stopPropagation()}
          >
            <IconRender color={getPriorityIconColor(currentLevel)} size={size} />
          </span>
        </Tooltip>
      ));

    if (disableDropdown) return <>{triggerNode}</>;

    if (!canEditTask)
      return (
        <Tooltip title={reason}>
          <span
            className={styles.triggerDisabled}
            style={{ display: 'inline-flex' }}
            onClick={(e) => e.stopPropagation()}
          >
            {triggerNode}
          </span>
        </Tooltip>
      );

    return (
      <DropdownMenu items={menuItems} open={open} onOpenChange={setOpen}>
        {triggerNode}
      </DropdownMenu>
    );
  },
);

export default TaskPriorityTag;
