import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceSlug } from '@/business/client/hooks/useActiveWorkspaceSlug';
import { toast } from '@/components/toast';
import { buildWorkspaceAwarePath } from '@/features/Workspace/workspaceAwarePath';
import { useAppOrigin } from '@/hooks/useAppOrigin';
import { taskDetailSelectors } from '@/store/task/selectors';

import { taskDetailPath } from '../shared/taskDetailPath';
import { commentAnchorId } from './commentActions';
import { useTaskDetailSelector, useTaskDetailTaskId } from './TaskDetailScope';

/**
 * Copies `<issue link>#comment-<id>`. The issue link is built the same way as
 * the header's "Copy link" (readable identifier, workspace-aware path).
 */
export const useCommentCopyLink = () => {
  const { t } = useTranslation('chat');
  const appOrigin = useAppOrigin();
  const workspaceSlug = useActiveWorkspaceSlug();
  const taskId = useTaskDetailTaskId();
  const taskAgentId = useTaskDetailSelector(taskDetailSelectors.taskAgentId);
  const taskTitle = useTaskDetailSelector(taskDetailSelectors.taskName);
  const taskIdentifier = useTaskDetailSelector(
    (s, scopedTaskId) => taskDetailSelectors.taskDetail(s, scopedTaskId)?.identifier,
  );
  const taskRef = taskIdentifier ?? taskId;

  return useCallback(
    async (commentId: string) => {
      if (!taskRef) return;
      const path = taskDetailPath(taskRef, taskAgentId ?? undefined, taskTitle);
      const url = `${appOrigin}${buildWorkspaceAwarePath(path, workspaceSlug)}#${commentAnchorId(commentId)}`;
      try {
        await navigator.clipboard.writeText(url);
        toast.success(t('taskList.contextMenu.copyLinkSuccess'));
      } catch {
        toast.error(t('taskDetail.comment.copyLinkFailed'));
      }
    },
    [appOrigin, t, taskAgentId, taskRef, taskTitle, workspaceSlug],
  );
};
