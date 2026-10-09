'use client';

import { memo } from 'react';

import IssueSaveStatus from './IssueSaveStatus';
import TaskDetailHeaderActions from './TaskDetailHeaderActions';
import { TaskDetailScope } from './TaskDetailScope';

interface IssuePeekActionsProps {
  /**
   * Called after the issue is deleted from the menu. A peek host closes its
   * pane here; without it the full-page behaviour (go to `/tasks`) applies.
   */
  onDeleted?: () => void;
  taskId: string;
}

/**
 * The right-hand cluster of a peek pane header: the issue's save status, the
 * favourite star and the "…" menu — the same pieces the full page header
 * mounts, bound to the pane's own issue.
 */
const IssuePeekActions = memo<IssuePeekActionsProps>(({ onDeleted, taskId }) => (
  <TaskDetailScope taskId={taskId}>
    <IssueSaveStatus key={taskId} taskId={taskId} />
    <TaskDetailHeaderActions onDeleted={onDeleted} />
  </TaskDetailScope>
));

IssuePeekActions.displayName = 'IssuePeekActions';

export default IssuePeekActions;
