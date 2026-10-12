import { cn } from 'cn';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { taskDetailSelectors } from '@/store/task/selectors';

import TaskExecutionBadge from '../features/TaskExecutionBadge';
import {
  EXECUTION_KIND_LABEL_KEYS,
  findLatestOwnRun,
  type IssueExecutionAction,
  type IssueExecutionView,
  resolveIssueExecution,
} from './issueExecution';
import RunFailureReason from './RunFailureReason';
import { taskDetailLayoutStyles as styles } from './taskDetailLayoutStyles';
import { useTaskDetailSelector, useTaskDetailTaskId } from './TaskDetailScope';
import { useIssueDetailCapabilities } from './useIssueDetailActions';
import { useRunWithContractCheck } from './useRunWithContractCheck';

interface TaskExecutionActionProps {
  action: IssueExecutionAction;
  blocked: boolean;
}

/**
 * Start / Retry / Resume. A disabled button cannot show a tooltip, so the
 * reason it is unavailable is written next to it.
 */
export const TaskExecutionAction = memo<TaskExecutionActionProps>(({ action, blocked }) => {
  const { t } = useTranslation('chat');
  const taskId = useTaskDetailTaskId();
  const {
    accessResolved,
    canEditTask,
    canExecuteTask,
    permissionReason,
    runtimeWithheld,
    runWithContractCheck,
  } = useRunWithContractCheck();
  const [pending, setPending] = useState(false);

  // Unfinished prerequisites are already explained by the section's own hint.
  // While access is still loading the button waits without claiming a refusal.
  const deniedReason = !canEditTask
    ? permissionReason
    : runtimeWithheld
      ? t('taskDetail.execution.runtimeWithheld')
      : !canExecuteTask && accessResolved
        ? t('taskDetail.execution.noAgentAccess')
        : undefined;

  const handleClick = async () => {
    if (!taskId || !canExecuteTask || blocked || pending) return;
    setPending(true);
    try {
      // A refused or failed start is reported; the Execution state itself is
      // re-read from the server by the run action either way.
      if ((await runWithContractCheck(taskId)) === 'failed')
        toast.error(t('taskDetail.execution.startFailed'));
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      {deniedReason && <p className="text-xs leading-5 text-muted-foreground">{deniedReason}</p>}
      <Button
        className="self-start"
        disabled={!canExecuteTask || blocked}
        loading={pending}
        size="sm"
        variant="outline"
        onClick={() => void handleClick()}
      >
        {t(`taskDetail.execution.action.${action}`)}
      </Button>
    </>
  );
});

TaskExecutionAction.displayName = 'TaskExecutionAction';

const useIssueExecutionView = (): { reason?: string | null; view: IssueExecutionView | null } => {
  const detail = useTaskDetailSelector(taskDetailSelectors.taskDetail);
  const blocked = useTaskDetailSelector(taskDetailSelectors.isTaskBlocked);
  if (!detail) return { view: null };

  const latestRun = findLatestOwnRun(detail.activities, detail.id);
  return {
    // The run's own recorded reason first; a failure that never produced a run
    // (the dispatch failed before one started) leaves it on the Issue.
    reason: latestRun?.error ?? detail.error,
    view: resolveIssueExecution({
      agentId: detail.agentId,
      assigneeUserId: detail.userId,
      automationMode: detail.automationMode,
      blocked,
      dispatchPhase: detail.dispatchPhase,
      dispatchWaitingReason: detail.dispatchWaitingReason,
      latestRunStatus: latestRun?.status,
      orchestrationAdmission: detail.orchestrationAdmission,
      status: detail.status,
      workflowCategory: detail.workflowCategory,
    }),
  };
};

/**
 * The one place on the Issue that explains agent execution: what state it is
 * in, why it is waiting or why it failed, and the action that moves it on.
 * Renders nothing for an Issue no agent is involved with.
 */
const TaskExecutionSection = memo(() => {
  const { t } = useTranslation('chat');
  const { readOnly } = useIssueDetailCapabilities();
  const { reason, view } = useIssueExecutionView();

  if (!view) return null;

  const labelKey = EXECUTION_KIND_LABEL_KEYS[view.kind];
  const label = labelKey ? String(t(labelKey as never)) : undefined;

  return (
    <div
      aria-label={t('taskDetail.executionStatus')}
      className="flex min-w-0 max-w-full flex-col gap-1.5"
      data-execution-kind={view.kind}
      data-testid="task-execution"
      role="group"
      title={t('taskDetail.executionStatus')}
    >
      <div className={styles.propertyValue}>
        {view.badge ? (
          <TaskExecutionBadge showLabel execution={view.badge} label={label} size={16} />
        ) : (
          <span
            className={cn(
              view.kind === 'needsAgent' ? 'text-warning-text' : 'text-muted-foreground',
            )}
          >
            {label}
          </span>
        )}
      </div>
      {view.hints.map((hint) => (
        <p className="text-xs leading-5 text-muted-foreground" key={hint.key}>
          {String(t(hint.key as never, hint.params as never))}
        </p>
      ))}
      {view.showFailureReason && <RunFailureReason reason={reason} />}
      {view.action && !readOnly && (
        <TaskExecutionAction action={view.action} blocked={view.actionBlocked} />
      )}
    </div>
  );
});

TaskExecutionSection.displayName = 'TaskExecutionSection';

export default TaskExecutionSection;
