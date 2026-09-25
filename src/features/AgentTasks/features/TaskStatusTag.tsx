import {
  DropdownMenuItem,
  DropdownMenuItemContent,
  DropdownMenuItemExtra,
  DropdownMenuItemIcon,
  DropdownMenuItemLabel,
  DropdownMenuPopup,
  DropdownMenuPortal,
  DropdownMenuPositioner,
  DropdownMenuRoot,
  DropdownMenuTrigger,
  Icon,
  Tooltip,
} from '@lobehub/ui';
import { toast } from '@lobehub/ui/base-ui';
import type { TaskStatus } from '@orvilo/types';
import { createStaticStyles, cssVar } from 'antd-style';
import { CopySlashIcon, InboxIcon, Loader2Icon } from 'lucide-react';
import type { ReactNode } from 'react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import MarkDuplicateModal from '@/features/WorkTeams/MarkDuplicateModal';
import { buildTriageMutationInput } from '@/features/WorkTeams/triage/teamTriageRowModel';
import { usePermission } from '@/hooks/usePermission';
import { workAttentionService } from '@/services/workAttention';
import { useTaskStore } from '@/store/task';

import { renderMenuExtra } from './menuExtra';
import { STATUS_META, USER_SELECTABLE_STATUSES } from './taskStatusMeta';
import { useTaskStatusChange } from './useTaskStatusChange';

export { STATUS_META, USER_SELECTABLE_STATUSES } from './taskStatusMeta';

const DUPLICATE_OPTION_INDEX = USER_SELECTABLE_STATUSES.length;
const TRIAGE_OPTION_INDEX = USER_SELECTABLE_STATUSES.length + 1;

const styles = createStaticStyles(({ css, cssVar }) => ({
  popup: css`
    & [role='option'] {
      font-size: 13px;
      font-weight: 450;
    }
  `,
  trigger: css`
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    transition: filter ${cssVar.motionDurationMid};

    &:hover {
      filter: brightness(0.85);
    }
  `,
  triggerDisabled: css`
    cursor: not-allowed;
    display: inline-flex;
    opacity: 0.5;

    &:hover {
      filter: none;
    }
  `,
}));

interface TaskStatusTagProps {
  children?: ReactNode;
  disableDropdown?: boolean;
  onChange?: (status: TaskStatus) => void | Promise<void>;
  size?: number;
  status?: TaskStatus;
  taskIdentifier?: string;
  /**
   * Team-task intake context. When provided, the menu appends Linear's trailing
   * "Duplicate"/"Triage" entries and routes them through `workAttention.triage`.
   */
  triageTarget?: { domainRevision: number; id: string; teamId: string };
}

const TaskStatusTag = memo<TaskStatusTagProps>(
  ({ children, disableDropdown, onChange, size = 16, status, taskIdentifier, triageTarget }) => {
    const [loading, setLoading] = useState(false);
    const [open, setOpen] = useState(false);
    const [duplicateModalOpen, setDuplicateModalOpen] = useState(false);
    const { t } = useTranslation('chat');
    const { allowed: canEditTask, reason } = usePermission('create_content');
    const changeTaskStatus = useTaskStatusChange();
    const refreshTaskDetail = useTaskStore((s) => s.internal_refreshTaskDetail);
    const refreshTaskList = useTaskStore((s) => s.refreshTaskList);

    const displayStatus = status ?? 'backlog';
    const meta = STATUS_META[displayStatus];

    const handleStatusChange = useCallback(
      async (nextStatus: TaskStatus) => {
        if (!canEditTask) return;
        if (nextStatus === displayStatus) return;
        if (onChange) {
          setLoading(true);
          try {
            await onChange(nextStatus);
          } finally {
            setLoading(false);
          }
          return;
        }
        if (!taskIdentifier) return;
        setLoading(true);

        try {
          await changeTaskStatus(taskIdentifier, nextStatus);
        } finally {
          setLoading(false);
        }
      },
      [canEditTask, changeTaskStatus, displayStatus, onChange, taskIdentifier],
    );

    const runTriageAction = useCallback(
      async (action: 'duplicate' | 'retriage', canonicalTaskId?: string) => {
        if (!triageTarget) return;
        const input = buildTriageMutationInput(triageTarget, triageTarget.teamId, action, {
          canonicalTaskId,
        });
        if (!input) return;
        try {
          await workAttentionService.triage(input);
          if (taskIdentifier) await refreshTaskDetail(taskIdentifier).catch(() => {});
          await refreshTaskList();
        } catch {
          toast.error(t('taskDetail.updateFailed'));
        }
      },
      [refreshTaskDetail, refreshTaskList, t, taskIdentifier, triageTarget],
    );

    const actionsRef = useRef({ handleStatusChange, runTriageAction });
    actionsRef.current = { handleStatusChange, runTriageAction };

    const hasTriageOptions = Boolean(triageTarget);

    useEffect(() => {
      if (!open) return;
      const onKeyDown = (event: KeyboardEvent) => {
        const num = Number.parseInt(event.key, 10);
        if (Number.isNaN(num)) return;
        const idx = num - 1;
        const optionCount = hasTriageOptions
          ? TRIAGE_OPTION_INDEX + 1
          : USER_SELECTABLE_STATUSES.length;
        if (idx < 0 || idx >= optionCount) return;
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        if (idx < USER_SELECTABLE_STATUSES.length) {
          void actionsRef.current.handleStatusChange(USER_SELECTABLE_STATUSES[idx]);
        } else if (idx === DUPLICATE_OPTION_INDEX) {
          setDuplicateModalOpen(true);
        } else {
          void actionsRef.current.runTriageAction('retriage');
        }
      };
      document.addEventListener('keydown', onKeyDown, true);
      return () => document.removeEventListener('keydown', onKeyDown, true);
    }, [open, hasTriageOptions]);

    const triggerNode =
      children ||
      (loading ? (
        <Icon spin color={cssVar.colorTextDescription} icon={Loader2Icon} size={size} />
      ) : (
        <Tooltip title={t(`taskDetail.${meta.labelKey}`, { defaultValue: meta.label })}>
          <span className={styles.trigger} onClick={(e) => e.stopPropagation()}>
            <Icon color={meta.color} icon={meta.icon} size={size} />
          </span>
        </Tooltip>
      ));

    if (disableDropdown) return <>{triggerNode}</>;

    if (!canEditTask)
      return (
        <Tooltip title={reason}>
          <span className={styles.triggerDisabled} onClick={(e) => e.stopPropagation()}>
            {triggerNode}
          </span>
        </Tooltip>
      );

    return (
      <>
        <DropdownMenuRoot open={open} onOpenChange={setOpen}>
          <DropdownMenuTrigger>{triggerNode}</DropdownMenuTrigger>
          <DropdownMenuPortal>
            <DropdownMenuPositioner placement={'bottomLeft'}>
              <DropdownMenuPopup aria-labelledby={''} className={styles.popup} role={'listbox'}>
                {USER_SELECTABLE_STATUSES.map((statusKey, index) => {
                  const statusMeta = STATUS_META[statusKey];
                  const isCurrent = statusKey === displayStatus;
                  const label = t(`taskDetail.${statusMeta.labelKey}`, {
                    defaultValue: statusMeta.label,
                  });
                  return (
                    <DropdownMenuItem
                      aria-selected={isCurrent}
                      key={statusKey}
                      label={label}
                      role={'option'}
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleStatusChange(statusKey);
                      }}
                    >
                      <DropdownMenuItemContent>
                        <DropdownMenuItemIcon>
                          <Icon color={statusMeta.color} icon={statusMeta.icon} size={16} />
                        </DropdownMenuItemIcon>
                        <DropdownMenuItemLabel>{label}</DropdownMenuItemLabel>
                        <DropdownMenuItemExtra>
                          {renderMenuExtra(String(index + 1), isCurrent)}
                        </DropdownMenuItemExtra>
                      </DropdownMenuItemContent>
                    </DropdownMenuItem>
                  );
                })}
                {hasTriageOptions && (
                  <>
                    <DropdownMenuItem
                      label={t('savedViews.values.triageStatus.duplicate', { ns: 'common' })}
                      role={'option'}
                      onClick={(event) => {
                        event.stopPropagation();
                        setDuplicateModalOpen(true);
                      }}
                    >
                      <DropdownMenuItemContent>
                        <DropdownMenuItemIcon>
                          <Icon icon={CopySlashIcon} size={16} />
                        </DropdownMenuItemIcon>
                        <DropdownMenuItemLabel>
                          {t('savedViews.values.triageStatus.duplicate', { ns: 'common' })}
                        </DropdownMenuItemLabel>
                        <DropdownMenuItemExtra>
                          {renderMenuExtra(String(DUPLICATE_OPTION_INDEX + 1), false)}
                        </DropdownMenuItemExtra>
                      </DropdownMenuItemContent>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      label={t('taskDetail.workflow.category.triage')}
                      role={'option'}
                      onClick={(event) => {
                        event.stopPropagation();
                        void runTriageAction('retriage');
                      }}
                    >
                      <DropdownMenuItemContent>
                        <DropdownMenuItemIcon>
                          <Icon icon={InboxIcon} size={16} />
                        </DropdownMenuItemIcon>
                        <DropdownMenuItemLabel>
                          {t('taskDetail.workflow.category.triage')}
                        </DropdownMenuItemLabel>
                        <DropdownMenuItemExtra>
                          {renderMenuExtra(String(TRIAGE_OPTION_INDEX + 1), false)}
                        </DropdownMenuItemExtra>
                      </DropdownMenuItemContent>
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuPopup>
            </DropdownMenuPositioner>
          </DropdownMenuPortal>
        </DropdownMenuRoot>
        {triageTarget && (
          <MarkDuplicateModal
            open={duplicateModalOpen}
            taskId={triageTarget.id}
            onClose={() => setDuplicateModalOpen(false)}
            onConfirm={(id, canonicalTaskId) => void runTriageAction('duplicate', canonicalTaskId)}
          />
        )}
      </>
    );
  },
);

export default TaskStatusTag;
