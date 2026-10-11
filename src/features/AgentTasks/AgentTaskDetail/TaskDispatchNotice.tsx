import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { taskDetailSelectors } from '@/store/task/selectors';

import { resolveIssueDispatchNotices } from '../shared/dispatchNotice';
import { useTaskDetailSelector } from './TaskDetailScope';

/**
 * Says why the Issue's dispatch has not started, under the execution badge
 * that would otherwise read "Queued" or "Waiting" with no explanation.
 */
const TaskDispatchNotice = memo(() => {
  const { t } = useTranslation('chat');
  const dispatchPhase = useTaskDetailSelector(taskDetailSelectors.taskDispatchPhase);
  const dispatchWaitingReason = useTaskDetailSelector(
    taskDetailSelectors.taskDispatchWaitingReason,
  );
  const orchestrationAdmission = useTaskDetailSelector(
    taskDetailSelectors.taskOrchestrationAdmission,
  );

  const notices = useMemo(
    () =>
      resolveIssueDispatchNotices({ dispatchPhase, dispatchWaitingReason, orchestrationAdmission }),
    [dispatchPhase, dispatchWaitingReason, orchestrationAdmission],
  );

  if (notices.length === 0) return null;

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-1" data-testid="task-dispatch-notice">
      {notices.map((notice) => (
        <p className="text-xs text-muted-foreground" key={notice.key}>
          {t(notice.key as never, notice.params as never) as string}
        </p>
      ))}
    </div>
  );
});

TaskDispatchNotice.displayName = 'TaskDispatchNotice';

export default TaskDispatchNotice;
