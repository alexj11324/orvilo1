import { Flexbox } from '@lobehub/ui';
import { memo } from 'react';

import { LinearTaskSyncProvider } from '@/features/AgentTasks/shared/LinearTaskSyncStatus';
import { useTaskStore } from '@/store/task';
import { taskDetailSelectors } from '@/store/task/selectors';

import TaskAcceptance from './TaskAcceptance';
import TaskActivities from './TaskActivities';
import TaskArtifacts from './TaskArtifacts';
import { taskDetailLayoutStyles as styles } from './taskDetailLayoutStyles';
import TaskDetailRunPauseAction from './TaskDetailRunPauseAction';
import TaskDetailTitleInput from './TaskDetailTitleInput';
import TaskInstruction from './TaskInstruction';
import TaskParentBar from './TaskParentBar';
import TaskPrerequisites from './TaskPrerequisites';
import TaskProjectSection from './TaskProjectSection';
import TaskProperties from './TaskProperties';
import TaskRailActions from './TaskRailActions';
import TaskSubtasks from './TaskSubtasks';

/**
 * The scrollable body sections of a task detail, shared by the full-page
 * `/task/[tid]` route and the chat-side Portal. All children read the active
 * task from the task store, so the host is responsible for setting
 * `activeTaskId` (e.g. via `setActiveTaskId`) before rendering this.
 */
const TaskDetailSections = memo(() => {
  const taskId = useTaskStore(taskDetailSelectors.activeTaskDatabaseId);

  return (
    <LinearTaskSyncProvider taskIds={taskId ? [taskId] : []}>
      <div className={styles.root}>
        <div className={styles.header}>
          <Flexbox className={styles.main} gap={12}>
            {/* Reference order: the title owns the top line, then the
                "Sub-issue of" parent bar, then the run controls — the
                task's one primary CTA cluster. The agent executor lives in
                the rail's Assignee group, not here. */}
            <TaskDetailTitleInput />
            <TaskParentBar />
            <TaskDetailRunPauseAction />
          </Flexbox>
          <div className={styles.side}>
            {/* Rail, top to bottom, matching the reference: round quick
                actions, then the labeled Properties / Project / Related
                groups. */}
            <TaskRailActions />
            <TaskProperties />
            <TaskProjectSection />
            <TaskPrerequisites />
          </div>
          {/* Third grid child: the prose column lives inside the same grid so
              the wide layout bounds it to the left track beside the rail —
              matching the reference, where body text never runs under the
              properties column. */}
          <Flexbox className={styles.body} gap={24}>
            <TaskInstruction />
            <TaskAcceptance />
            <TaskSubtasks />
            <TaskArtifacts />
            <TaskActivities />
          </Flexbox>
        </div>
      </div>
    </LinearTaskSyncProvider>
  );
});

export default TaskDetailSections;
