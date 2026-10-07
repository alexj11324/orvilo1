import { useTranslation } from 'react-i18next';

import { buttonHoverFeedback } from '@/components/ui/button';
import WorkspaceLink from '@/features/Workspace/WorkspaceLink';
import { taskDetailSelectors } from '@/store/task/selectors';

import { taskDetailPath } from '../shared/taskDetailPath';
import { useTaskDetailSelector } from './TaskDetailScope';

export const TaskDuplicateRelation = () => {
  const { t } = useTranslation('chat');
  const duplicate = useTaskDetailSelector(taskDetailSelectors.taskDetail)?.duplicateOf;
  if (!duplicate) return null;
  return (
    <div className="flex min-w-0 items-center gap-2 text-sm">
      <span className="shrink-0 text-muted-foreground">{t('taskDetail.menu.duplicateOf')}</span>
      {duplicate.identifier ? (
        <WorkspaceLink
          className={`min-w-0 truncate rounded-md px-2 py-1 ${buttonHoverFeedback}`}
          to={taskDetailPath(duplicate.identifier, undefined, duplicate.name)}
        >
          {duplicate.identifier}
          {duplicate.name ? ` · ${duplicate.name}` : ''}
        </WorkspaceLink>
      ) : (
        <span className="text-muted-foreground">{t('taskDetail.menu.unavailable')}</span>
      )}
    </div>
  );
};
