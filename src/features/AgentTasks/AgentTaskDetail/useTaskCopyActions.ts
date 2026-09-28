import { copyToClipboard } from '@lobehub/ui';
import { toast } from '@lobehub/ui/base-ui';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceSlug } from '@/business/client/hooks/useActiveWorkspaceSlug';
import { buildWorkspaceAwarePath } from '@/features/Workspace/workspaceAwarePath';
import { useAppOrigin } from '@/hooks/useAppOrigin';
import { useTaskStore } from '@/store/task';
import { taskDetailSelectors } from '@/store/task/selectors';

import { taskDetailPath } from '../shared/taskDetailPath';

/**
 * Clipboard actions for the active task. Shared by the rail's round quick
 * buttons (`TaskRailActions`) and the header overflow menu so both copy
 * byte-for-byte the same values.
 */
export const useTaskCopyActions = () => {
  const { t } = useTranslation('chat');

  const appOrigin = useAppOrigin();
  const activeWorkspaceSlug = useActiveWorkspaceSlug();
  const taskId = useTaskStore(taskDetailSelectors.activeTaskId);
  const taskAgentId = useTaskStore(taskDetailSelectors.activeTaskAgentId);
  const taskTitle = useTaskStore(taskDetailSelectors.activeTaskName);
  const taskIdentifier = useTaskStore((s) => taskDetailSelectors.activeTaskDetail(s)?.identifier);
  // A task only gets a `task/<identifier>` branch when it is bound to a repo
  // workspace — the runner provisions a worktree there. Without the binding
  // there is no branch to copy, so the action hides rather than inventing one.
  const hasBranch = useTaskStore(
    (s) => !!taskDetailSelectors.activeTaskDetail(s)?.config?.workspace,
  );

  const copyId = useCallback(async () => {
    if (!taskId) return;

    await copyToClipboard(taskId);
    toast.success(t('taskList.contextMenu.copyIdSuccess'));
  }, [taskId, t]);

  const copyLink = useCallback(async () => {
    if (!taskId) return;

    // Carry the title into the copied link so a pasted URL says what the task is.
    const taskUrl = `${appOrigin}${buildWorkspaceAwarePath(
      taskDetailPath(taskId, taskAgentId ?? undefined, taskTitle),
      activeWorkspaceSlug,
    )}`;

    await copyToClipboard(taskUrl);
    toast.success(t('taskList.contextMenu.copyLinkSuccess'));
  }, [taskId, taskAgentId, taskTitle, appOrigin, activeWorkspaceSlug, t]);

  // The convention is fixed in TaskWorkspaceConfig: every provisioned run works
  // on `task/<identifier>` — copying it matches Linear's "copy git branch".
  const copyBranch = useCallback(async () => {
    if (!taskIdentifier) return;

    await copyToClipboard(`task/${taskIdentifier}`);
    toast.success(t('taskDetail.copyBranchSuccess'));
  }, [taskIdentifier, t]);

  return { copyBranch, copyId, copyLink, hasBranch: hasBranch && !!taskIdentifier, taskId };
};
