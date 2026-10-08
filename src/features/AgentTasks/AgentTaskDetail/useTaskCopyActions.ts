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
 * Clipboard actions for the active task. Shared by the rail's round quick
 * buttons (`TaskRailActions`) and the header overflow menu so both copy
 * byte-for-byte the same values. The title / Markdown variants are menu-only.
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
  const taskInstruction = useTaskDetailSelector(
    (s, scopedTaskId) => taskDetailSelectors.taskDetail(s, scopedTaskId)?.instruction,
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

  // Carry the title into the copied link so a pasted URL says what the task is.
  const taskUrl = taskId
    ? `${appOrigin}${buildWorkspaceAwarePath(
        taskDetailPath(taskId, taskAgentId ?? undefined, taskTitle),
        activeWorkspaceSlug,
      )}`
    : '';
  // An untitled task still needs link text, so it falls back to its readable id.
  const title = taskTitle || taskIdentifier || taskId || '';

  const copyLink = useCallback(async () => {
    if (!taskId) return;

    await navigator.clipboard.writeText(taskUrl);
    toast.success(t('taskList.contextMenu.copyLinkSuccess'));
  }, [taskId, taskUrl, t]);

  const copyTitle = useCallback(async () => {
    if (!taskId) return;

    await navigator.clipboard.writeText(title);
    toast.success(t('taskList.contextMenu.copyTitleSuccess'));
  }, [taskId, title, t]);

  const copyTitleAsLink = useCallback(async () => {
    if (!taskId) return;

    await navigator.clipboard.writeText(`[${title}](${taskUrl})`);
    toast.success(t('taskList.contextMenu.copyLinkSuccess'));
  }, [taskId, title, taskUrl, t]);

  // The whole issue as a pasteable document: heading, description, source link.
  // An empty description drops out instead of leaving a blank block.
  const copyMarkdown = useCallback(async () => {
    if (!taskId) return;

    const markdown = [`# ${taskIdentifier ?? taskId}: ${title}`, taskInstruction?.trim(), taskUrl]
      .filter(Boolean)
      .join('\n\n');
    await navigator.clipboard.writeText(markdown);
    toast.success(t('taskList.contextMenu.copyMarkdownSuccess'));
  }, [taskId, taskIdentifier, title, taskInstruction, taskUrl, t]);

  // The convention is fixed in TaskWorkspaceConfig: every provisioned run works
  // on `task/<identifier>` — copying it matches Linear's "copy git branch".
  const copyBranch = useCallback(async () => {
    if (!taskIdentifier) return;

    await navigator.clipboard.writeText(`task/${taskIdentifier}`);
    toast.success(t('taskDetail.copyBranchSuccess'));
  }, [taskIdentifier, t]);

  return {
    copyBranch,
    copyId,
    copyLink,
    copyMarkdown,
    copyTitle,
    copyTitleAsLink,
    hasBranch: hasBranch && !!taskIdentifier,
    taskId,
  };
};
