import { cn } from 'cn';
import { memo, useRef, useState } from 'react';

import { LinearTaskSyncProvider } from '@/features/AgentTasks/shared/LinearTaskSyncStatus';
import { taskDetailSelectors } from '@/store/task/selectors';

import TaskActivities from './TaskActivities';
import TaskArtifacts from './TaskArtifacts';
import TaskDetailAddActions from './TaskDetailAddActions';
import { taskDetailLayoutStyles as styles } from './taskDetailLayoutStyles';
import { useTaskDetailSelector } from './TaskDetailScope';
import TaskDetailTitleInput from './TaskDetailTitleInput';
import { TaskDuplicateRelation } from './TaskDuplicateRelation';
import TaskInstruction from './TaskInstruction';
import TaskIssueResources from './TaskIssueResources';
import TaskParentBar from './TaskParentBar';
import { TaskBlockedNotice } from './TaskPrerequisites';
import TaskProjectSection from './TaskProjectSection';
import TaskProperties from './TaskProperties';
import TaskSubtasks from './TaskSubtasks';

/**
 * The scrollable body sections of a task detail, shared by the full-page
 * `/task/[tid]` route and the chat-side Portal. Children resolve their task
 * through `TaskDetailScope` — the host binds a taskId (or, outside a scope,
 * reads fall back to the store's `activeTaskId`).
 */
const TaskDetailSections = memo(() => {
  const taskId = useTaskDetailSelector(taskDetailSelectors.taskDatabaseId);
  // The add row and the Sub-issues section share one composer.
  const [subIssueComposerOpen, setSubIssueComposerOpen] = useState(false);
  const composerTaskRef = useRef(taskId);
  if (composerTaskRef.current !== taskId) {
    composerTaskRef.current = taskId;
    setSubIssueComposerOpen(false);
  }

  return (
    <LinearTaskSyncProvider taskIds={taskId ? [taskId] : []}>
      <div className={styles.root}>
        <div data-task-detail-header className={styles.header}>
          <div className={cn('flex flex-col gap-3', styles.main)}>
            {/* Reference order: the title owns the top line, then the
                "Sub-issue of" parent bar; assignee lives in the properties. */}
            <TaskDetailTitleInput />
            <TaskParentBar />
            <TaskDuplicateRelation />
          </div>
          <div data-task-detail-side className={styles.side}>
            <div className={styles.propertyGroups}>
              <TaskProperties />
              <TaskProjectSection />
            </div>
          </div>
          <div className={cn('flex flex-col gap-3', styles.description)}>
            <TaskInstruction />
            <TaskDetailAddActions onAddSubIssue={() => setSubIssueComposerOpen(true)} />
          </div>
          <div className={cn('flex flex-col gap-6', styles.body)}>
            <TaskBlockedNotice />
            <TaskSubtasks
              composerOpen={subIssueComposerOpen}
              onComposerOpenChange={setSubIssueComposerOpen}
            />
            <TaskArtifacts />
            <TaskIssueResources />
            <TaskActivities />
          </div>
        </div>
      </div>
    </LinearTaskSyncProvider>
  );
});

export default TaskDetailSections;
