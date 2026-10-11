import { memo } from 'react';

import { taskDetailSelectors } from '@/store/task/selectors';

import { shouldOfferManualRun } from '../shared/dispatchNotice';
import TaskDetailRunPauseAction from './TaskDetailRunPauseAction';
import { useTaskDetailSelector } from './TaskDetailScope';

/** The Issue header's run control, withheld where the Orchestrator starts work. */
const IssueRunAction = memo(() => {
  const canPause = useTaskDetailSelector(taskDetailSelectors.canPauseTask);
  const orchestrationAdmission = useTaskDetailSelector(
    taskDetailSelectors.taskOrchestrationAdmission,
  );

  if (!shouldOfferManualRun({ canPause: !!canPause, orchestrationAdmission })) return null;

  return <TaskDetailRunPauseAction />;
});

IssueRunAction.displayName = 'IssueRunAction';

export default IssueRunAction;
