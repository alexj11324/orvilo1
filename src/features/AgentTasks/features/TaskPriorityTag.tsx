import type { IconType } from '@lobehub/icons';
import { type DropdownItem, DropdownMenu, Icon, type MenuInfo, Tooltip } from '@lobehub/ui';
import { createStaticStyles, cssVar } from 'antd-style';
import { Loader2Icon } from 'lucide-react';
import type { ReactNode } from 'react';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  getPriorityIconColor,
  PRIORITY_ICONS,
  PRIORITY_LEVELS,
  resolvePriorityLevel,
} from '@/components/PriorityIcon';
import { usePermission } from '@/hooks/usePermission';

import { renderMenuExtra } from './menuExtra';
import { useMenuDigitShortcuts } from './useMenuDigitShortcuts';
import { useTaskPriorityChange } from './useTaskPriorityChange';

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
  searchInput: css`
    width: 100%;
    padding-block: 4px;
    padding-inline: 10px;
    border: none;

    font-family: inherit;
    font-size: 13px;
    color: ${cssVar.colorText};

    background: transparent;
    outline: none;

    &::placeholder {
      color: ${cssVar.colorTextPlaceholder};
    }
  `,
  showingCaption: css`
    padding-block: 2px;
    padding-inline: 10px;
    font-size: 12px;
    color: ${cssVar.colorTextTertiary};
  `,
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
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const { t } = useTranslation('chat');
    const { allowed: canEditTask, reason } = usePermission('create_content');

    const currentLevel = resolvePriorityLevel(priority);
    const meta = PRIORITY_META[currentLevel];
    const { apply: handlePriorityChange, pending: loading } = useTaskPriorityChange({
      canEdit: canEditTask,
      currentPriority: currentLevel,
      onChange,
      taskIdentifier,
    });

    // Same search-header contract as the status menu — letters filter,
    // digits remain menu accelerators.
    const levelLabel = useCallback(
      (level: number) =>
        t(`taskDetail.${PRIORITY_META[level].labelKey}` as never, {
          defaultValue: PRIORITY_META[level].label,
        }) as string,
      [t],
    );
    const filteredLevels = useMemo(() => {
      const needle = query.trim().toLowerCase();
      if (!needle) return PRIORITY_LEVELS;
      return PRIORITY_LEVELS.filter((level) => levelLabel(level).toLowerCase().includes(needle));
    }, [query, levelLabel]);

    useEffect(() => {
      if (!open) setQuery('');
    }, [open]);

    useMenuDigitShortcuts({
      items: filteredLevels,
      open,
      onPick: (level) => {
        void handlePriorityChange(level);
        setOpen(false);
      },
    });

    const menuItems = useMemo<DropdownItem[]>(
      () =>
        filteredLevels.map((level, index) => {
          const value = PRIORITY_META[level];
          const IconRender = value.icon;
          const isCurrent = level === currentLevel;
          return {
            extra: renderMenuExtra(String(index + 1), isCurrent),
            icon: <IconRender color={getPriorityIconColor(level)} size={16} />,
            key: String(level),
            label: levelLabel(level),
            onClick: ({ domEvent }: MenuInfo) => {
              domEvent.stopPropagation();
              void handlePriorityChange(level);
            },
          };
        }),
      [currentLevel, filteredLevels, handlePriorityChange, levelLabel],
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
            data-row-control={'priority'}
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
      <DropdownMenu
        items={menuItems}
        open={open}
        header={
          <>
            <input
              autoFocus
              className={styles.searchInput}
              value={query}
              aria-label={t('taskDetail.changePriorityPlaceholder', {
                defaultValue: 'Change priority…',
              })}
              placeholder={t('taskDetail.changePriorityPlaceholder', {
                defaultValue: 'Change priority…',
              })}
              onChange={(event) => setQuery(event.target.value)}
              onClick={(event) => event.stopPropagation()}
            />
            <div className={styles.showingCaption}>
              {query.trim()
                ? t('taskDetail.showingItems', {
                    count: filteredLevels.length,
                    defaultValue: 'Showing {{count}} items',
                  })
                : t('taskDetail.showingAllItems', { defaultValue: 'Showing all items' })}
            </div>
          </>
        }
        onOpenChange={setOpen}
      >
        {triggerNode}
      </DropdownMenu>
    );
  },
);

export default TaskPriorityTag;
