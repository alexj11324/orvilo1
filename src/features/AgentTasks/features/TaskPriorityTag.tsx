import type { IconType } from '@lobehub/icons';
import { cn } from 'cn';
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
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { usePermission } from '@/hooks/usePermission';

import { renderMenuExtra } from './menuExtra';
import { PICKER_TRIGGER_FOCUS_CLASS } from './pickerTriggerStyles';
import { READ_ONLY_BUTTON_WRAPPER_CLASS, readOnlyPickerTrigger } from './readOnlyPickerTrigger';
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

const styles = {
  searchInput:
    'w-full rounded-(--radius-input) border-0 bg-transparent dark:bg-transparent px-2.5 py-1 text-sm leading-5.5 text-foreground outline-none placeholder:text-(--ant-color-text-placeholder)',
  showingCaption: 'px-2.5 py-0.5 text-xs leading-5 text-foreground-tertiary',
  trigger:
    'inline-flex cursor-pointer items-center text-foreground-description transition-[color] duration-(--orvilo-motion-mid) ease-[ease] motion-reduce:transition-none hover:text-foreground',
  triggerUrgent: 'inline-flex cursor-pointer items-center text-(--ant-orange)',
  triggerDisabled:
    'cursor-not-allowed opacity-50 hover:text-foreground-description hover:filter-none',
};

interface TaskPriorityTagProps {
  children?: ReactNode;
  disableDropdown?: boolean;
  /** Matches native button children; the default icon trigger is a span. */
  nativeButton?: boolean;
  onChange?: (priority: number) => void;
  priority?: number | null;
  size?: number;
  taskIdentifier?: string;
}

const TaskPriorityTag = memo<TaskPriorityTagProps>(
  ({
    children,
    disableDropdown,
    nativeButton = false,
    onChange,
    size = 16,
    priority,
    taskIdentifier,
  }) => {
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
        <span
          aria-label={t('taskDetail.property.priority')}
          className={cn(styles.trigger, PICKER_TRIGGER_FOCUS_CLASS)}
        >
          <Spinner style={{ height: size, width: size }} />
        </span>
      ) : (
        <span
          data-row-control={'priority'}
          aria-label={t('taskDetail.fieldValue', {
            field: t('taskDetail.property.priority'),
            value: levelLabel(currentLevel),
          })}
          className={cn(
            isUrgent ? styles.triggerUrgent : styles.trigger,
            PICKER_TRIGGER_FOCUS_CLASS,
          )}
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
            className={
              nativeButton
                ? READ_ONLY_BUTTON_WRAPPER_CLASS
                : cn(styles.triggerDisabled, 'inline-flex')
            }
            onClick={(e) => e.stopPropagation()}
          >
            {readOnlyPickerTrigger(triggerNode, nativeButton)}
          </span>
        </SimpleTooltip>
      );

    return (
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger
          nativeButton={nativeButton}
          render={triggerNode as ReactElement}
          onClick={(event) => event.stopPropagation()}
        />
        <DropdownMenuContent className="min-w-52">
          <Input
            autoFocus
            className={styles.searchInput}
            value={query}
            visualSize="normal"
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
          <DropdownMenuGroup>
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
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  },
);

export default TaskPriorityTag;
