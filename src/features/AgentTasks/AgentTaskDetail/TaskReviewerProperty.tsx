import { useTranslation } from 'react-i18next';

import { taskDetailSelectors } from '@/store/task/selectors';

import AssigneeAvatar from '../features/AssigneeAvatar';
import { ReviewerAgentSelector } from '../features/ReviewerAgentSelector';
import { useAgentDisplayMeta } from '../shared/useAgentDisplayMeta';
import { useTaskDetailSelector, useTaskDetailTaskId } from './TaskDetailScope';

const TaskReviewerProperty = () => {
  const { t } = useTranslation('chat');
  const taskId = useTaskDetailTaskId();
  const reviewerAgentId = useTaskDetailSelector(taskDetailSelectors.taskReviewerAgentId);
  const reviewer = useAgentDisplayMeta(reviewerAgentId);
  return (
    <div className="flex items-center gap-2 px-3 text-sm">
      <span className="text-muted-foreground">{t('taskDetail.reviewer')}</span>
      <ReviewerAgentSelector currentAgentId={reviewerAgentId} taskIdentifier={taskId}>
        <span className="flex items-center gap-1.5">
          <AssigneeAvatar agentId={reviewerAgentId} size={16} />
          {reviewer?.title ?? t('taskDetail.property.addReviewer')}
        </span>
      </ReviewerAgentSelector>
    </div>
  );
};

export default TaskReviewerProperty;
