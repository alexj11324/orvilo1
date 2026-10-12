import { memo } from 'react';

import { taskDetailSelectors } from '@/store/task/selectors';

import { showsHeaderRunControl } from './issueExecution';
import TaskDetailRunPauseAction from './TaskDetailRunPauseAction';
import { useTaskDetailSelector } from './TaskDetailScope';

/**
 * The Issue header never starts a run — assigning an agent and moving the
 * Issue to In Progress does, and Retry / Resume / Start live in the Execution
 * area next to the reason. What stays here stops a run in progress, or manages
 * the schedule of a scheduled Issue. Automations keep the full control.
 */
const IssueHeaderRunControl = memo(() => {
  const canPause = useTaskDetailSelector(taskDetailSelectors.canPauseTask);
  const status = useTaskDetailSelector(taskDetailSelectors.taskStatus);

  if (!showsHeaderRunControl({ canPause: !!canPause, status })) return null;

  return <TaskDetailRunPauseAction />;
});

IssueHeaderRunControl.displayName = 'IssueHeaderRunControl';

export default IssueHeaderRunControl;
