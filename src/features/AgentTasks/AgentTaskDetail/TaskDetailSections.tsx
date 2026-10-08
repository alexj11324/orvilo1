import { memo } from 'react';

import { LinearTaskSyncProvider } from '@/features/AgentTasks/shared/LinearTaskSyncStatus';
import { taskDetailSelectors } from '@/store/task/selectors';

import TaskActivities from './TaskActivities';
import TaskArtifacts from './TaskArtifacts';
import TaskDetailAssignee from './TaskDetailAssignee';
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
import TaskRailActions from './TaskRailActions';
import TaskSubtasks from './TaskSubtasks';

/**
 * The scrollable body sections of a task detail, shared by the full-page
 * `/task/[tid]` route and the chat-side Portal. Children resolve their task
 * through `TaskDetailScope` — the host binds a taskId (or, outside a scope,
 * reads fall back to the store's `activeTaskId`).
 */
const TaskDetailSections = memo(() => {
  const taskId = useTaskDetailSelector(taskDetailSelectors.taskDatabaseId);

  return (
    <LinearTaskSyncProvider taskIds={taskId ? [taskId] : []}>
      <div className={styles.root}>
        <div data-task-detail-header className={styles.header}>
          <div className={`flex flex-col gap-3 ${styles.main}`}>
            {/* Reference order: the title owns the top line, then the
                "Sub-issue of" parent bar, then the run/assignee controls. */}
            <TaskDetailTitleInput />
            <TaskParentBar />
            <TaskDuplicateRelation />
            <div className="flex items-center gap-2 flex-wrap" style={{ maxWidth: '100%' }}>
              <TaskDetailAssignee />
            </div>
          </div>
          <div className={styles.description}>
            <TaskInstruction />
          </div>
          <div data-task-detail-side className={styles.side}>
            <TaskRailActions />
            <TaskProperties />
            <TaskProjectSection />
          </div>
          <div className={`flex flex-col gap-6 ${styles.body}`}>
            <TaskBlockedNotice />
            <TaskSubtasks />
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
