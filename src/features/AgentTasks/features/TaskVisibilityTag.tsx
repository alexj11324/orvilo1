import { createStaticStyles, cssVar } from 'antd-style';
import { Loader2Icon } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';
import { memo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { usePermission } from '@/hooks/usePermission';
import { useTaskStore } from '@/store/task';

import { renderMenuCheck } from './menuExtra';
import { SimpleTooltip } from './SimpleTooltip';
import {
  getTaskVisibilityDefaultLabel,
  getTaskVisibilityLabelKey,
  TASK_VISIBILITY_ICONS,
} from './taskVisibilityLabel';

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
  triggerDisabled: css`
    cursor: not-allowed;
    opacity: 0.5;

    &:hover {
      color: ${cssVar.colorTextDescription};
      filter: none;
    }
  `,
}));

const VISIBILITY_OPTIONS: Array<'private' | 'public'> = ['private', 'public'];

interface TaskVisibilityTagProps {
  /** Render trigger UI (chip / icon). When omitted, the component renders the
   *  default tooltip + icon. */
  children?: ReactNode;
  /** Hide the dropdown entirely — used by callers that only want the icon. */
  disableDropdown?: boolean;
  /** When set, treats the chip as locked: dropdown is suppressed and a
   *  tooltip explains why. Used by the create form when the selected agent
   *  is private (a private agent can only run private tasks). */
  lockedReason?: string;
  /** Controlled mode (e.g. create form): caller owns the state. */
  onChange?: (next: 'private' | 'public') => void;
  size?: number;
  /** Persisted mode: when set, the dropdown calls `updateTaskVisibility` on the
   *  store directly. Mutually exclusive with `onChange`. */
  taskIdentifier?: string;
  visibility: 'private' | 'public';
}

const TaskVisibilityTag = memo<TaskVisibilityTagProps>(
  ({
    children,
    disableDropdown,
    lockedReason,
    onChange,
    size = 14,
    taskIdentifier,
    visibility,
  }) => {
    const [loading, setLoading] = useState(false);
    const [open, setOpen] = useState(false);
    const { t } = useTranslation('chat');
    const activeWorkspaceId = useActiveWorkspaceId();
    const { allowed: canEdit, reason } = usePermission('create_content');
    const updateTaskVisibility = useTaskStore((s) => s.updateTaskVisibility);

    const handleVisibilityChange = useCallback(
      async (next: 'private' | 'public') => {
        if (next === visibility) return;
        if (onChange) {
          onChange(next);
          return;
        }
        if (!taskIdentifier) return;
        setLoading(true);
        try {
          await updateTaskVisibility(taskIdentifier, next);
        } finally {
          setLoading(false);
        }
      },
      [onChange, taskIdentifier, updateTaskVisibility, visibility],
    );

    const IconComp = TASK_VISIBILITY_ICONS[visibility];
    const label = t(getTaskVisibilityLabelKey(visibility) as never, {
      defaultValue: getTaskVisibilityDefaultLabel(visibility),
    });

    // Personal mode: the visibility column exists but the workspace-mode
    // filtering is inert — hide the UI entirely so users aren't asked to make
    // a meaningless choice.
    if (!activeWorkspaceId && !taskIdentifier) return null;

    const triggerNode =
      children ||
      (loading ? (
        <Loader2Icon
          className="animate-spin"
          size={size}
          style={{ color: cssVar.colorTextDescription }}
        />
      ) : (
        <SimpleTooltip title={label}>
          <span className={styles.trigger} onClick={(e) => e.stopPropagation()}>
            <IconComp size={size} />
          </span>
        </SimpleTooltip>
      ));

    if (disableDropdown) return <>{triggerNode}</>;
    if (lockedReason)
      return (
        <SimpleTooltip title={lockedReason}>
          <span
            className={styles.triggerDisabled}
            style={{ display: 'inline-flex' }}
            onClick={(e) => e.stopPropagation()}
          >
            {triggerNode}
          </span>
        </SimpleTooltip>
      );
    if (!canEdit)
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
        <DropdownMenuTrigger render={triggerNode as ReactElement} />
        <DropdownMenuContent className="min-w-40">
          {VISIBILITY_OPTIONS.map((option) => {
            const OptionIcon = TASK_VISIBILITY_ICONS[option];
            return (
              <DropdownMenuItem
                key={option}
                onClick={(event) => {
                  event.stopPropagation();
                  void handleVisibilityChange(option);
                }}
              >
                <OptionIcon size={16} style={{ color: cssVar.colorTextSecondary }} />
                <span className="flex-1">
                  {t(getTaskVisibilityLabelKey(option) as never, {
                    defaultValue: getTaskVisibilityDefaultLabel(option),
                  })}
                </span>
                {renderMenuCheck(option === visibility)}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  },
);

TaskVisibilityTag.displayName = 'TaskVisibilityTag';

export default TaskVisibilityTag;
