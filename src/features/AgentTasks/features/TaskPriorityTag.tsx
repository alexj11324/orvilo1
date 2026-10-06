import type { IconType } from '@lobehub/icons';
import { createStaticStyles, cssVar } from 'antd-style';
import { Loader2Icon } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  getPriorityIconColor,
  PRIORITY_ICONS,
  PRIORITY_LEVELS,
  resolvePriorityLevel,
} from '@/components/PriorityIcon';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { usePermission } from '@/hooks/usePermission';

import { renderMenuExtra } from './menuExtra';
import { SimpleTooltip } from './SimpleTooltip';
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

    const IconRender = meta.icon;
    const isUrgent = currentLevel === 1;

    const triggerNode =
      children ||
      (loading ? (
        <span className={styles.trigger}>
          <Loader2Icon
            className="animate-spin"
            size={size}
            style={{ color: cssVar.colorTextDescription }}
          />
        </span>
      ) : (
        <span
          className={isUrgent ? styles.triggerUrgent : styles.trigger}
          data-row-control={'priority'}
        >
          <SimpleTooltip
            title={t(`taskDetail.${meta.labelKey}` as never, { defaultValue: meta.label })}
          >
            <IconRender color={getPriorityIconColor(currentLevel)} size={size} />
          </SimpleTooltip>
        </span>
      ));

    if (disableDropdown) return <>{triggerNode}</>;

    if (!canEditTask)
      return (
        <SimpleTooltip title={reason}>
          <span
            className={styles.triggerDisabled}
            style={{ display: 'inline-flex' }}
            onClick={(e) => e.stopPropagation()}
          >
            {triggerNode}
          </span>
        </SimpleTooltip>
      );

    return (
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger
          nativeButton={false}
          render={triggerNode as ReactElement}
          onClick={(event) => event.stopPropagation()}
        />
        <DropdownMenuContent className="min-w-52">
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
            onKeyDown={(event) => {
              if (event.key !== 'Escape') event.stopPropagation();
            }}
          />
          <div className={styles.showingCaption}>
            {query.trim()
              ? t('taskDetail.showingItems', {
                  count: filteredLevels.length,
                  defaultValue: 'Showing {{count}} items',
                })
              : t('taskDetail.showingAllItems', { defaultValue: 'Showing all items' })}
          </div>
          {filteredLevels.map((level, index) => {
            const ItemIcon = PRIORITY_META[level].icon;
            return (
              <DropdownMenuItem
                key={level}
                onClick={(event) => {
                  event.stopPropagation();
                  void handlePriorityChange(level);
                }}
              >
                <ItemIcon color={getPriorityIconColor(level)} size={16} />
                <span className="flex-1">{levelLabel(level)}</span>
                {renderMenuExtra(String(index + 1), level === currentLevel)}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  },
);

export default TaskPriorityTag;
