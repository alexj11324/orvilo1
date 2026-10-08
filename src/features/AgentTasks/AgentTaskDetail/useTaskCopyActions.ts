import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceSlug } from '@/business/client/hooks/useActiveWorkspaceSlug';
import { toast } from '@/components/toast';
import { buildWorkspaceAwarePath } from '@/features/Workspace/workspaceAwarePath';
import { useAppOrigin } from '@/hooks/useAppOrigin';
import { taskDetailSelectors } from '@/store/task/selectors';

import { taskDetailPath } from '../shared/taskDetailPath';
import { useTaskDetailSelector, useTaskDetailTaskId } from './TaskDetailScope';

/**
 * Clipboard actions for the active task, used by the header overflow menu.
 */
export const useTaskCopyActions = () => {
  const { t } = useTranslation('chat');

  const appOrigin = useAppOrigin();
  const activeWorkspaceSlug = useActiveWorkspaceSlug();
  const taskId = useTaskDetailTaskId();
  const taskAgentId = useTaskDetailSelector(taskDetailSelectors.taskAgentId);
  const taskTitle = useTaskDetailSelector(taskDetailSelectors.taskName);
  const taskIdentifier = useTaskDetailSelector(
    (s, scopedTaskId) => taskDetailSelectors.taskDetail(s, scopedTaskId)?.identifier,
  );
  // A task only gets a `task/<identifier>` branch when it is bound to a repo
  // workspace — the runner provisions a worktree there. Without the binding
  // there is no branch to copy, so the action hides rather than inventing one.
  const hasBranch = useTaskDetailSelector(
    (s, scopedTaskId) => !!taskDetailSelectors.taskDetail(s, scopedTaskId)?.config?.workspace,
  );

  const copyId = useCallback(async () => {
    if (!taskId) return;

    await navigator.clipboard.writeText(taskId);
    toast.success(t('taskList.contextMenu.copyIdSuccess'));
  }, [taskId, t]);

  const copyLink = useCallback(async () => {
    if (!taskId) return;

    // Carry the title into the copied link so a pasted URL says what the task is.
    const taskUrl = `${appOrigin}${buildWorkspaceAwarePath(
      taskDetailPath(taskId, taskAgentId ?? undefined, taskTitle),
      activeWorkspaceSlug,
    )}`;

    await navigator.clipboard.writeText(taskUrl);
    toast.success(t('taskList.contextMenu.copyLinkSuccess'));
  }, [taskId, taskAgentId, taskTitle, appOrigin, activeWorkspaceSlug, t]);

  // The convention is fixed in TaskWorkspaceConfig: every provisioned run works
  // on `task/<identifier>` — copying it matches Linear's "copy git branch".
  const copyBranch = useCallback(async () => {
    if (!taskIdentifier) return;

    await navigator.clipboard.writeText(`task/${taskIdentifier}`);
    toast.success(t('taskDetail.copyBranchSuccess'));
  }, [taskIdentifier, t]);

  return { copyBranch, copyId, copyLink, hasBranch: hasBranch && !!taskIdentifier, taskId };
};
